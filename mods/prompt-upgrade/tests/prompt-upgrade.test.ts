import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptSubmitInput } from 'claude-code'

import { parseQuestions, parseRewrite, route } from '../hooks/logic'

const PLUGIN = 'prompt-upgrade'
const ROUGH = 'Build me a 30-day marketing plan for a pizza company.'
const ZERO = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const QUESTIONS = JSON.stringify({
  questions: [
    { question: "What's the main goal of this 30-day plan?", options: ['More online orders', 'More foot traffic'] },
    { question: 'What marketing budget should the plan assume?', options: ['Under $500', '$500 to $2,000', 'Mostly free tactics'] },
  ],
})
const UPGRADE_TEXT =
  'Build me a 30-day marketing plan for [pizza company name] whose main goal is more online orders. Lay it out week by week as a table, and finish with how I will know it worked.'
const REWRITE = JSON.stringify({
  prompt: UPGRADE_TEXT,
  added: ['Main goal: online orders', 'Week-by-week table', 'A definition of done'],
})

type Rig = {
  clock: ReturnType<typeof mock.clock>
  sent: { text: string; origin: string }[]
  filled: string[]
  opened: string[]
  asked: number
  prompts: string[]
  askedFirst: number
  box: string
}

// Everything beneath the plugin: the model, the pane host, the prompt box.
function rig(
  on: On,
  replies: (string | null)[],
  { isPlaced = true, ask = 'yes' }: { isPlaced?: boolean; ask?: 'yes' | 'no' | 'dismiss' } = {},
): Rig {
  const state: Rig = { clock: mock.clock(on), sent: [], filled: [], opened: [], asked: 0, prompts: [], askedFirst: 0, box: '' }
  mock.store(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  // The Enter-time question: "Upgrade this prompt before sending it?"
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    state.askedFirst += 1
    if (ask === 'dismiss') return { deny: 'dismissed' }
    const question = e.questions[0]!.question
    const label = ask === 'yes' ? 'Yes, upgrade it' : 'No, send as typed'
    return { result: { questions: e.questions, answers: { [question]: label } } }
  })
  on('session.messages', () => ({
    value: [{ role: 'user', text: 'We are planning the Toronto launch of Slice House.', toolUses: [] }],
  }))
  on('model.complete', (_$, e) => {
    state.asked += 1
    state.prompts.push(e.prompt)
    const text = replies.shift()
    if (text === null || text === undefined) {
      return { value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: ZERO } }
    }
    return { value: { isAnswered: true, text, usage: ZERO } }
  })
  on('ui.open', (_$, e) =>
    isPlaced
      ? (state.opened.push(e.id), { value: { isPlaced: true } })
      : { value: { isPlaced: false, reason: 'narrow' } },
  )
  on('ui.close', () => ({ value: undefined }))
  on('ui.copy', () => ({ value: { isCopied: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.read', () => ({ value: { text: state.box, cursor: state.box.length } }))
  on('prompt.fill', (_$, e) => {
    state.filled.push(e.text)
    state.box = e.text
    return { isFilled: true }
  })
  on('prompt.submit', (_$, e) => {
    state.sent.push({ text: e.text, origin: e.origin.kind })
    return { text: e.text }
  })
  return state
}

// Auto is off by default; most tests cover the Enter-time flow, so they switch it on.
async function start($: Engine, { auto = true }: { auto?: boolean } = {}) {
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  if (auto) await better($, 'on')
}

function typed(text: string, extra: Partial<PromptSubmitInput> = {}): PromptSubmitInput {
  return { text, wait: false, origin: { kind: 'composer' }, ...extra }
}

function better($: Engine, args: string) {
  return $.command.run({
    command: 'better',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 200 },
  })
}

function mountPane($: Engine, bodyColumns = 90) {
  return $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'Pane',
    requestId: PLUGIN,
    props: {
      title: 'Prompt Upgrade',
      isFocused: true,
      bodyColumns,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 60 },
      view: {},
    },
  })
}

describe('which prompts are intercepted', () => {
  test('route: pass-through rules', () => {
    expect(route(typed(ROUGH), true)).toEqual({ kind: 'upgrade', text: ROUGH })
    expect(route(typed(ROUGH), false)).toEqual({ kind: 'pass' })
    expect(route(typed('/compact', { command: { name: 'compact', args: '' } }), true).kind).toBe('pass')
    expect(route(typed(ROUGH, { attachments: [{ type: 'image' }] }), true).kind).toBe('pass')
    expect(route(typed(ROUGH, { turnId: 't1' }), true).kind).toBe('pass')
    expect(route(typed('yes'), true).kind).toBe('pass')
    expect(route(typed('Keep going.'), true).kind).toBe('pass')
    expect(route(typed('What should I do next?'), true).kind).toBe('pass')
    expect(route(typed('> send this exactly'), true)).toEqual({ kind: 'strip', text: 'send this exactly' })
    expect(route({ ...typed(ROUGH), origin: { kind: 'plugin' } }, true).kind).toBe('pass')
    expect(route({ ...typed(ROUGH), origin: { kind: 'sdk' } }, true).kind).toBe('pass')
  })

  test('a typed prompt opens the pane; the others reach the session untouched', async ($, on) => {
    const r = rig(on, [QUESTIONS])
    await start($)

    const taken = await $.prompt.submit(typed(ROUGH))
    expect(taken.drop).toBe('Prompt Upgrade is working on it.')
    expect(r.opened).toEqual([PLUGIN])
    expect(r.sent).toHaveLength(0)

    await $.prompt.submit(typed('yes'))
    await $.prompt.submit(typed('fix this', { turnId: 'turn-1' }))
    await $.prompt.submit(typed('> do exactly this'))
    expect(r.sent.map(s => s.text)).toEqual(['yes', 'fix this', 'do exactly this'])
  })

  test('too narrow: the words go back in the box', async ($, on) => {
    const r = rig(on, [QUESTIONS], { isPlaced: false })
    await start($)
    const taken = await $.prompt.submit(typed(ROUGH))
    expect(taken.drop).toMatch(/wider window/)
    await r.clock.advance(200)
    expect(r.filled).toEqual([ROUGH])
    expect(r.asked).toBe(0)
  })
})

describe('asking before upgrading', () => {
  test('no: the prompt is sent exactly as typed and no pane opens', async ($, on) => {
    const r = rig(on, [QUESTIONS], { ask: 'no' })
    await start($)
    const result = await $.prompt.submit(typed(ROUGH))
    expect(result.drop).toBeUndefined()
    expect(r.askedFirst).toBe(1)
    expect(r.sent).toEqual([{ text: ROUGH, origin: 'composer' }])
    expect(r.opened).toHaveLength(0)
    expect(r.asked).toBe(0)
  })

  test('dismissed: nothing is sent and the words go back in the box', async ($, on) => {
    const r = rig(on, [QUESTIONS], { ask: 'dismiss' })
    await start($)
    const result = await $.prompt.submit(typed(ROUGH))
    expect(result.drop).toMatch(/Kept your prompt/)
    await r.clock.advance(200)
    expect(r.filled).toEqual([ROUGH])
    expect(r.sent).toHaveLength(0)
    expect(r.opened).toHaveLength(0)
  })

  test('the review offers Send my original', async ($, on) => {
    const r = rig(on, ['{"questions":[]}', REWRITE])
    await start($)
    await $.prompt.submit(typed(ROUGH))
    await r.clock.settle()
    const ui = await mountPane($)
    await ui.press({ key: 'send-original' })
    expect(r.sent).toEqual([{ text: ROUGH, origin: 'plugin' }])
    await ui.unmount()
  })
})

describe('reading the model', () => {
  test('questions: fenced JSON is read and held to 2 questions of up to 4 options', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      question: `Question ${i}?`,
      options: ['a', 'b', 'c', 'd', 'e', 'Other'],
    }))
    const read = parseQuestions('Sure!\n```json\n' + JSON.stringify({ questions: many }) + '\n```')
    expect(read).toHaveLength(2)
    expect(read?.[0]?.options).toEqual(['a', 'b', 'c', 'd'])
    expect(parseQuestions('{"questions":[]}')).toEqual([])
    expect(parseQuestions('no json here')).toBeUndefined()
  })

  test('rewrite: JSON with what was added, or plain text', () => {
    expect(parseRewrite(REWRITE)).toEqual({
      text: UPGRADE_TEXT,
      added: ['Main goal: online orders', 'Week-by-week table', 'A definition of done'],
    })
    expect(parseRewrite('Just the prompt, plainly.')).toEqual({ text: 'Just the prompt, plainly.', added: [] })
    expect(parseRewrite('{"prompt": ""}')).toBeUndefined()
  })
})

describe('the full flow', () => {
  test('/better to Run: questions, rewrite, review, sent once and never re-intercepted', async ($, on) => {
    const r = rig(on, [QUESTIONS, REWRITE])
    await start($)

    const answer = await better($, ROUGH)
    expect(answer.text).toBe('Upgrading your prompt in the pane.')
    await r.clock.settle()

    const ui = await mountPane($)
    expect(await ui.find({ text: /main goal of this 30-day plan/ })).toBeDefined()
    expect(await ui.find({ text: /0 of 2 answered/ })).toBeDefined()

    expect(await ui.find({ text: /QUESTION 1 OF 2/ })).toBeDefined()
    expect(await ui.find({ text: /marketing budget/ })).toBeUndefined()
    expect(r.prompts[0]).toContain('Toronto launch')

    await ui.press({ key: 'q0-o0' })
    expect(await ui.find({ text: /1 of 2 answered/ })).toBeDefined()
    expect(await ui.find({ text: /QUESTION 2 OF 2/ })).toBeDefined()
    await ui.press({ key: 'q1-skip' })

    expect(r.asked).toBe(2)
    expect(await ui.find({ key: 'run' })).toBeDefined()
    expect(await ui.find({ text: /Week-by-week table/ })).toBeDefined()
    expect(await ui.find({ text: /THE UPGRADE/ })).toBeDefined()

    await ui.press({ key: 'run' })
    await r.clock.settle()
    expect(r.sent).toEqual([{ text: UPGRADE_TEXT, origin: 'plugin' }])
    expect(r.opened).toHaveLength(1)
    await ui.unmount()
  })

  test('no helpful questions: straight to the rewrite', async ($, on) => {
    const r = rig(on, ['{"questions":[]}', REWRITE])
    await start($)
    await $.prompt.submit(typed(ROUGH))
    await r.clock.settle()
    const ui = await mountPane($)
    expect(r.asked).toBe(2)
    expect(await ui.find({ key: 'run' })).toBeDefined()
    await ui.unmount()
  })

  test('Cancel closes and puts the original back in the prompt box', async ($, on) => {
    const r = rig(on, [QUESTIONS])
    await start($)
    await $.prompt.submit(typed(ROUGH))
    await r.clock.settle()
    const ui = await mountPane($)
    await ui.press({ key: 'cancel' })
    expect(r.filled).toEqual([ROUGH])
    expect(r.sent).toHaveLength(0)
    await ui.unmount()
  })

  test('a failed model call shows the error card and can send the original', async ($, on) => {
    const r = rig(on, [null])
    await start($)
    await $.prompt.submit(typed(ROUGH))
    await r.clock.settle()
    const ui = await mountPane($)
    expect(await ui.find({ text: /Your prompt is safe/ })).toBeDefined()
    await ui.press({ key: 'send-original' })
    expect(r.sent).toEqual([{ text: ROUGH, origin: 'plugin' }])
    await ui.unmount()
  })

  test('history reopens a past review', async ($, on) => {
    const r = rig(on, [QUESTIONS, REWRITE])
    await start($)
    await better($, ROUGH)
    await r.clock.settle()
    let ui = await mountPane($)
    await ui.press({ key: 'go' })
    await ui.press({ key: 'cancel' })
    await ui.unmount()

    await better($, 'history')
    await r.clock.settle()
    ui = await mountPane($)
    const rows = (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('h-'))
    expect(rows).toHaveLength(1)
    await ui.press({ key: rows[0]!.key! })
    expect(await ui.find({ key: 'run' })).toBeDefined()
    await ui.unmount()
  })
})

describe('the prompt box after an upgrade', () => {
  test('the old draft is cleared once the upgrade runs; new typing is kept', async ($, on) => {
    const r = rig(on, ['{"questions":[]}', REWRITE])
    await start($)
    r.box = ROUGH // the engine hands the dropped prompt back to the box
    await $.prompt.submit(typed(ROUGH))
    await r.clock.advance(200)
    expect(r.box).toBe('')

    r.box = ROUGH
    const ui = await mountPane($)
    await ui.press({ key: 'run' })
    expect(r.box).toBe('')
    expect(r.sent).toEqual([{ text: UPGRADE_TEXT, origin: 'plugin' }])
    await ui.unmount()
  })

  test('something new in the box is never wiped', async ($, on) => {
    const r = rig(on, ['{"questions":[]}', REWRITE])
    await start($)
    await $.prompt.submit(typed(ROUGH))
    await r.clock.advance(200)
    r.box = 'a different thought'
    const ui = await mountPane($)
    await ui.press({ key: 'run' })
    expect(r.box).toBe('a different thought')
    await ui.unmount()
  })
})

describe('the on and off switch', () => {
  test('off by default: prompts go straight through until /better on', async ($, on) => {
    const r = rig(on, [QUESTIONS])
    await start($, { auto: false })

    await $.prompt.submit(typed(ROUGH))
    expect(r.sent.map(s => s.text)).toEqual([ROUGH])
    expect(r.askedFirst).toBe(0)
    expect(r.opened).toHaveLength(0)
  })

  test('/better off lets prompts through, /better on takes them again', async ($, on) => {
    const r = rig(on, [QUESTIONS])
    await start($)

    expect((await better($, 'off')).text).toMatch(/off/)
    await $.prompt.submit(typed(ROUGH))
    expect(r.sent.map(s => s.text)).toEqual([ROUGH])

    expect((await better($, 'on')).text).toMatch(/on/)
    const taken = await $.prompt.submit(typed(ROUGH))
    expect(taken.drop).toBe('Prompt Upgrade is working on it.')
    expect(r.sent).toHaveLength(1)
  })
})

describe('sizing', () => {
  test('no text is wider than the pane, narrow or wide', async ($, on) => {
    const r = rig(on, [QUESTIONS, REWRITE, QUESTIONS, REWRITE])
    await start($)
    for (const width of [40, 120]) {
      await better($, ROUGH)
      await r.clock.settle()
      const ui = await mountPane($, width)
      for (const t of await ui.findAll({ type: 'Text' })) {
        expect(t.text.length).toBeLessThanOrEqual(width)
      }
      await ui.press({ key: 'go' })
      for (const t of await ui.findAll({ type: 'Text' })) {
        expect(t.text.length).toBeLessThanOrEqual(width)
      }
      await ui.press({ key: 'cancel' })
      await ui.unmount()
    }
  })
})
