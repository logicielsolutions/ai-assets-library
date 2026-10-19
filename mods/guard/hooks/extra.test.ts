import { describe, expect, test } from 'claude-code/testing'

import { findSecrets } from './detect'
import { DEFAULT_MIN_SCORE, SAMPLE, compareRows, covers, entityLabel, fromAnalyzer, lastLines, minScoreWarning, parseMinScore, pythonOk, setupSteps, statusText, STRUCTURED_ENTITIES } from './extra'

describe('extra security helpers', () => {
  test('entityLabel', () => expect(entityLabel('EMAIL_ADDRESS')).toBe('email-address'))

  test('fromAnalyzer keeps wanted entities above the score and slices the value', () => {
    const text = 'mail a@b.co now, org SSN'
    const hits = [
      { entity_type: 'EMAIL_ADDRESS', start: 5, end: 11, score: 1 },
      { entity_type: 'ORGANIZATION', start: 20, end: 23, score: 0.85 },
      { entity_type: 'PHONE_NUMBER', start: 0, end: 4, score: 0.2 },
    ]
    const found = fromAnalyzer(text, hits, STRUCTURED_ENTITIES, 0.4)
    expect(found).toEqual([{ label: 'email-address', start: 5, end: 11, value: 'a@b.co' }])
  })

  test('pythonOk accepts 3.9 to 3.14 only', () => {
    expect(pythonOk('Python 3.14.6')).toEqual({ ok: true, label: '3.14' })
    expect(pythonOk('Python 3.9.1').ok).toBe(true)
    expect(pythonOk('Python 3.8.10').ok).toBe(false)
    expect(pythonOk('Python 2.7.18').ok).toBe(false)
    expect(pythonOk('command not found').ok).toBe(false)
  })

  test('the basic layer catches only the AWS key in the sample; extra rows stay unknown until on', () => {
    const basic = findSecrets(SAMPLE)
    const rows = compareRows(basic, null)
    expect(rows.filter(r => r.basic).map(r => r.item)).toEqual(['AWS access key'])
    expect(rows.every(r => r.extra === null)).toBe(true)
  })

  test('with extra findings, rows are covered by either layer', () => {
    const basic = findSecrets(SAMPLE)
    const at = SAMPLE.indexOf('priya.sharma@acme.com')
    const extra = [{ label: 'email-address', start: at, end: at + 'priya.sharma@acme.com'.length, value: 'priya.sharma@acme.com' }]
    const rows = compareRows(basic, extra)
    expect(rows.find(r => r.item === 'Email address')).toEqual({ item: 'Email address', basic: false, extra: true })
    expect(rows.find(r => r.item === 'AWS access key')).toEqual({ item: 'AWS access key', basic: true, extra: true })
    expect(rows.find(r => r.item === 'PAN')?.extra).toBe(false)
    expect(covers(extra, SAMPLE, 'priya.sharma@acme.com')).toBe(true)
  })

  test('statusText names guard and the extra layer', () => {
    expect(statusText(true, 'off', 0)).toBe('🛡 guard on · extra security off (/guard setup)')
    expect(statusText(true, 'on', 2)).toBe('🛡 guard on · extra security on · 2 caught')
    expect(statusText(true, 'installing', 0)).toContain('setting up')
    expect(statusText(false, 'on', 5)).toBe('🛡 guard OFF')
  })

  test('setupSteps are the commands that will run, in order, under the given folder', () => {
    const steps = setupSteps('/h/.claude/guard', '/h/.claude/guard/venv/bin/python')
    expect(steps.map(s => s.argv[0])).toEqual(['python3', 'python3', '/h/.claude/guard/venv/bin/python', '/h/.claude/guard/venv/bin/python'])
    expect(steps[1]?.argv).toEqual(['python3', '-m', 'venv', '/h/.claude/guard/venv'])
    expect(steps[2]?.argv.join(' ')).toContain('presidio-analyzer==')
  })

  test('lastLines', () => expect(lastLines('a\n\nb  \nc\n', 2)).toEqual(['b', 'c']))

  test('parseMinScore falls back to the default when blank or not a number, and clamps', () => {
    expect(parseMinScore(undefined)).toBe(DEFAULT_MIN_SCORE)
    expect(parseMinScore('')).toBe(DEFAULT_MIN_SCORE)
    expect(parseMinScore('abc')).toBe(DEFAULT_MIN_SCORE)
    expect(parseMinScore('0.3')).toBe(0.3)
    expect(parseMinScore(1)).toBe(1)
    expect(parseMinScore(7)).toBe(1)
    expect(parseMinScore(-1)).toBe(0)
  })

  test('minScoreWarning only speaks up away from the suggested range', () => {
    expect(minScoreWarning(0.4)).toBeNull()
    expect(minScoreWarning(0.3)).toBeNull()
    expect(minScoreWarning(1)).toContain('phone numbers')
    expect(minScoreWarning(0.1)).toContain('false alarms')
  })
})
