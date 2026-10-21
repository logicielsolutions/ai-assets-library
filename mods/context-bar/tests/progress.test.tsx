import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { describeCall, duration, estimateLeft } from '../hooks/progress'

const PANE = {
  plugin: 'context-bar',
  component: 'Pane',
  requestId: 'progress',
  props: {
    title: 'Progress',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

// The engine beneath the mod: turns echo their id, tools answer
function engine(on: On) {
  mock.clock(on, { now: 1_000_000 })
  mock.store(on, {})
  on('session.cwd', () => ({ value: '/work/app' }))
  on('fs.list', () => ({ value: [] }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', { tool: 'TaskCreate' }, ($, e) => ({ result: {} as never, text: `Task #${e.subject.length} created successfully` }))
  on('tool.call', () => ({ result: {} as never, text: 'ok' }))
}

async function paneText(ui: { drawn: () => Promise<unknown> }): Promise<string> {
  const flatten = (node: unknown): string =>
    typeof node === 'string'
      ? node
      : node !== null && typeof node === 'object' && 'children' in node
        ? ((node as { children: unknown[] }).children ?? []).map(flatten).join('')
        : ''
  return flatten(await ui.drawn())
}

describe('helpers', () => {
  test('a call is described by its most telling field', async () => {
    expect(describeCall({ command: 'pytest -q', description: 'Run tests' })).toBe('Run tests')
    expect(describeCall({ file_path: '/work/app/src/kb/retrieve.py' })).toBe('kb/retrieve.py')
    expect(describeCall({})).toBe('')
  })

  test('durations and the estimate', async () => {
    expect(duration(4_000)).toBe('4s')
    expect(duration(134_000)).toBe('2m 14s')
    expect(estimateLeft(0, 60_000, 0, 4)).toBeNull()
    // One of four done in a minute: three minutes left
    expect(estimateLeft(0, 60_000, 1, 4)).toBe(180_000)
  })
})

test('the pane shows the prompt, its tasks and its steps', async ($, on) => {
  engine(on)
  await $.turn.start({ text: 'Fix the retrieval eval', turnId: 't1' })
  await $.tool.call({ tool: 'Skill', skill: 'superpowers:executing-plans' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Write the failing test', description: 'x' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Make it pass', description: 'y' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '22', status: 'completed' })
  await $.tool.call({ tool: 'Bash', command: 'pytest -q', description: 'Run tests' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const text = await paneText(ui)
    expect(text).toContain('Fix the retrieval eval')
    expect(text).toContain('working')
    expect(text).toContain('superpowers:executing-plans')
    expect(text).toContain('1/2')
    expect(text).toContain('Make it pass')
    expect(text).toContain('Run tests')
    await ui.unmount()
  }
})

test('a finished turn says done, and the next prompt starts fresh', async ($, on) => {
  engine(on)
  await $.turn.start({ text: 'First prompt', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls', description: 'List files' })
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })

  const after = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await paneText(after)).toContain('✓ done')
  await after.unmount()

  await $.turn.start({ text: 'Second prompt', turnId: 't2' })
  const next = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const text = await paneText(next)
  expect(text).toContain('Second prompt')
  expect(text).not.toContain('List files')
  await next.unmount()
})
