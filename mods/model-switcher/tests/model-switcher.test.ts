import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, TurnStepInput } from 'claude-code'

import { chips, cycle, presets, pretty, statusLine } from '../hooks/logic'

const PLUGIN = 'model-switcher'
const OFFERED = ['default', 'sonnet', 'opus', 'haiku', 'fable', 'opus[1m]']
const IDS: Record<string, string> = {
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
  haiku: 'claude-haiku-5-5',
  fable: 'claude-fable-5-1',
  'opus[1m]': 'claude-opus-5-5[1m]',
}

type Rig = {
  model: string
  sets: string[]
  lines: (string | undefined)[]
  toasts: string[]
  steps: TurnStepInput[]
}

// Everything beneath the plugin: the /config Model row, the session's model,
// the status line, toasts and the model requests.
function rig(on: On, { model = 'opus', deny }: { model?: string; deny?: string } = {}): Rig {
  const state: Rig = { model, sets: [], lines: [], toasts: [], steps: [] }
  mock.store(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('config.list', () => ({
    value: [
      {
        key: 'model',
        label: 'Model',
        kind: 'choice',
        value: state.model,
        options: OFFERED,
        provider: { plugin: 'engine', tier: 'core' },
        isLocked: false,
      },
    ],
  }))
  on('config.set', (_$, e) => {
    if (deny !== undefined) return { deny }
    state.sets.push(String(e.value))
    state.model = String(e.value)
    return { value: e.value }
  })
  on('session.model', () => ({ value: IDS[state.model] ?? state.model }))
  on('ui.status', (_$, e) => {
    state.lines.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    state.toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.step', async function* (_$, e) {
    state.steps.push(e)
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  return state
}

function start($: Engine) {
  return $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
}

async function step($: Engine, extra: Partial<TurnStepInput> = {}) {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 4, ...extra })
  for await (const _ of stream) {
    // drain
  }
  return stream.result
}

function band($: Engine, surface: 'terminal' | 'desktop', bodyColumns = 120) {
  return $.ui.mount({
    plugin: PLUGIN,
    surface,
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 10,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  })
}

describe('logic', () => {
  test('pretty names the resolved id', () => {
    expect(pretty('claude-opus-5-5[1m]')).toBe('Opus 5.5 · 1M')
    expect(pretty('claude-fable-5-1')).toBe('Fable 5.1')
    expect(pretty('claude-haiku-5-5-20260101')).toBe('Haiku 5.5')
    expect(pretty('some-gateway/model')).toBe('some-gateway/model')
  })

  test('chips follow the configured list, mark what Claude Code no longer offers, keep the current one', () => {
    expect(chips('haiku, sonnet, retired', OFFERED, 'opus[1m]')).toEqual([
      { value: 'haiku', isAvailable: true },
      { value: 'sonnet', isAvailable: true },
      { value: 'retired', isAvailable: false },
      { value: 'opus[1m]', isAvailable: true },
    ])
    expect(chips('all', OFFERED, 'opus').map(c => c.value)).toEqual(['sonnet', 'opus', 'haiku', 'fable', 'opus[1m]'])
  })

  test('presets parse and skip bad pairs', () => {
    expect(presets('Quick=haiku/low, Bad=opus, Odd=opus/huge, Deep=opus/max')).toEqual([
      { name: 'Quick', model: 'haiku', effort: 'low' },
      { name: 'Deep', model: 'opus', effort: 'max' },
    ])
  })

  test('status line and cycling', () => {
    expect(statusLine('claude-opus-5-5', null, 'high')).toBe('Opus 5.5 · auto (high)')
    expect(statusLine('claude-opus-5-5', 'medium', 'high')).toBe('Opus 5.5 · med')
    expect(cycle(['a', 'b', 'c'], 'c')).toBe('a')
    expect(cycle(['a', 'b'], 'x')).toBe('a')
  })
})

describe('switching the model', () => {
  test('the status line shows the resolved model at start', async ($, on) => {
    const r = rig(on, { model: 'opus[1m]' })
    await start($)
    expect(r.lines.at(-1)).toBe('Opus 5.5 · 1M · auto')
  })

  test('pressing a chip sets the /config Model row, on every surface', async ($, on) => {
    const r = rig(on)
    await start($)
    for (const surface of ['terminal', 'desktop'] as const) {
      r.model = 'opus'
      r.sets.length = 0
      const ui = await band($, surface)
      await ui.press({ key: 'model:sonnet' })
      expect(r.sets).toEqual(['sonnet'])
      expect(r.lines.at(-1)).toBe('Sonnet 5.5 · auto')
      await ui.unmount()
    }
  })

  test('a model Claude Code no longer offers is drawn struck through, not pressable', { options: { models: 'haiku, sonnet, retired-x' } }, async ($, on) => {
    rig(on)
    await start($)
    const ui = await band($, 'terminal')
    expect(await ui.find({ key: 'model:retired-x' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /retired-x/ })).toBeDefined()
    await ui.unmount()
  })

  test('a refused switch says why in a toast and keeps the model', async ($, on) => {
    const r = rig(on, { deny: 'blocked by policy' })
    await start($)
    const ui = await band($, 'terminal')
    await ui.press({ key: 'model:fable' })
    expect(r.toasts).toEqual(["Couldn't switch to fable: blocked by policy"])
    expect(r.model).toBe('opus')
    await ui.unmount()
  })
})

describe('switching the effort', () => {
  test('the pick rides on main requests only, and is remembered', async ($, on) => {
    const r = rig(on)
    await start($)
    const ui = await band($, 'terminal')
    await ui.press({ key: 'effort:max' })
    expect(r.lines.at(-1)).toBe('Opus 5.5 · max')

    await step($)
    await step($, { agentId: 'agent-1' })
    await step($, { effort: undefined })
    expect(r.steps.map(s => s.effort)).toEqual(['max', 'high', undefined])
    await ui.unmount()

    await start($)
    expect(r.lines.at(-1)).toBe('Opus 5.5 · max')
  })

  test('auto leaves the request as the engine made it', async ($, on) => {
    const r = rig(on)
    await start($)
    await step($)
    expect(r.steps[0]?.effort).toBe('high')
    expect(r.lines.at(-1)).toBe('Opus 5.5 · auto (high)')
  })

  test('with the subagents option on, subagents get the pick too', { options: { subagents: true } }, async ($, on) => {
    const r = rig(on)
    await start($)
    const ui = await band($, 'terminal')
    await ui.press({ key: 'effort:low' })
    await step($, { agentId: 'agent-1' })
    expect(r.steps[0]?.effort).toBe('low')
    await ui.unmount()
  })

  test('a preset sets both', async ($, on) => {
    const r = rig(on)
    await start($)
    const ui = await band($, 'terminal')
    await ui.press({ key: 'preset:Quick' })
    expect(r.sets).toEqual(['haiku'])
    expect(r.lines.at(-1)).toBe('Haiku 5.5 · low')
    await ui.unmount()
  })
})

describe('narrow terminals', () => {
  test('two buttons cycle the model and the effort', async ($, on) => {
    const r = rig(on)
    await start($)
    const ui = await band($, 'terminal', 50)
    expect(await ui.find({ key: 'model:sonnet' })).toBeUndefined()
    await ui.press({ key: 'cycle-model' })
    expect(r.sets).toEqual(['fable'])
    await ui.press({ key: 'cycle-effort' })
    expect(r.lines.at(-1)).toBe('Fable 5.1 · low')
    await ui.unmount()
  })
})
