import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { markBuilt, parsePlan, planProgress } from '../hooks/plan'

const PLAN_PATH = '/work/app/docs/superpowers/plans/2026-10-19-auth.md'

const PLAN_TEXT = `# Auth Implementation Plan

> Steps use checkbox (\`- [ ]\`) syntax for tracking.

### Task 1: Create users table

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Implement**

### Task 2: Add RLS policies

- [x] **Step 1: Write the failing test**
- [ ] **Step 2: Implement**

### Task 3a: Wire up login

- [ ] **Step 1: Write the failing test**
`

const BAND = {
  plugin: 'context-bar',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

// Stands in for the engine beneath the mod: tools answer, the plan file reads
function engine(on: On, files: Record<string, string>, store: Record<string, unknown> = {}) {
  mock.store(on, store)
  on('session.cwd', () => ({ value: '/work/app' }))
  on('fs.read', ($, e) => {
    const text = files[e.path]
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('tool.call', () => ({ result: {} as never, text: 'ok' }))
  // The engine's own band is empty
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
}

// Everything the band shows, as one line of text
async function bandText(ui: { drawn: () => Promise<unknown> }): Promise<string> {
  const flatten = (node: unknown): string =>
    typeof node === 'string'
      ? node
      : node !== null && typeof node === 'object' && 'children' in node
        ? ((node as { children: unknown[] }).children ?? []).map(flatten).join('')
        : ''
  return flatten(await ui.drawn())
}

async function measure($: Engine, percent: number) {
  await $.session.measure({
    context: { tokens: percent * 2000, window: 200_000, percent },
    rateLimits: [],
    changed: ['context'],
  })
}

const BUILT_PLAN = `# Shop Implementation Plan

### Task 1: Config

**Files:**
- Create: \`src/config.py\`

- [ ] **Step 1: Write it**

### Task 1a: Amend the config

- [ ] **Step 1: Amend it**

### Task 2: Server

**Files:**
- Create: \`src/server.py\`

- [ ] **Step 1: Write it**

### Task 3: Client

**Files:**
- Create: \`src/client.py\`

- [ ] **Step 1: Write it**
`

describe('parsePlan', () => {
  test('tasks whose files exist count as done, unticked', async () => {
    const plan = parsePlan(PLAN_PATH, BUILT_PLAN)
    expect(plan.tasks.map(t => t.creates)).toEqual([['src/config.py'], [], ['src/server.py'], ['src/client.py']])
    const built = markBuilt(plan, f => f !== 'src/client.py')
    // 1a creates nothing, and counts as done because Task 2 after it is
    expect(built.tasks.map(t => t.isDone)).toEqual([true, true, true, false])
    expect(planProgress(built, [])).toEqual({ done: 3, total: 4, current: 'Client' })
  })

  test('counts tasks and steps from superpowers checkboxes', async () => {
    const plan = parsePlan(PLAN_PATH, PLAN_TEXT)
    expect(plan.title).toBe('Auth')
    expect(plan.tasks.map(t => t.isDone)).toEqual([true, false, false])
    expect([plan.stepsDone, plan.stepsTotal]).toEqual([3, 5])
    expect(planProgress(plan, [])).toEqual({ done: 1, total: 3, current: 'Add RLS policies' })
  })

  test('completed todos count when the file is not ticked', async () => {
    const plan = parsePlan(PLAN_PATH, PLAN_TEXT.replaceAll('[x]', '[ ]'))
    const progress = planProgress(plan, [
      { id: '1', content: 'Task 1', status: 'completed' },
      { id: '2', content: 'Task 2', status: 'completed' },
      { id: '3', content: 'Wiring login', status: 'in_progress' },
    ])
    expect(progress).toEqual({ done: 2, total: 3, current: 'Wiring login' })
  })
})

test('without a superpowers plan, only the context bar shows', async ($, on) => {
  engine(on, { '/work/app/README.md': '# readme' })
  await measure($, 42)
  await $.tool.call({ tool: 'Read', file_path: '/work/app/README.md' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const text = await bandText(ui)
    expect(text).toContain('ctx')
    expect(text).toContain('42%')
    expect(text).not.toContain('plan')
    await ui.unmount()
  }
})

test('reading a superpowers plan adds the plan bar', async ($, on) => {
  engine(on, { [PLAN_PATH]: PLAN_TEXT })
  await measure($, 90)
  await $.tool.call({ tool: 'Read', file_path: PLAN_PATH })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const text = await bandText(ui)
    expect(text).toContain('plan')
    expect(text).toContain('1/3')
    expect(text).toContain('Add RLS policies')
    expect(text).toContain('/compact soon')
    await ui.unmount()
  }
})

test('a plan named in a shell command counts, even when the call fails', async ($, on) => {
  engine(on, { [PLAN_PATH]: PLAN_TEXT })
  on('tool.call', { tool: 'Bash' }, () => ({ result: {} as never, text: 'too big', isError: true }))
  await measure($, 20)
  await $.tool.call({ tool: 'Bash', command: "grep -n 'Task' docs/superpowers/plans/2026-10-19-auth.md" })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await bandText(ui)).toContain('1/3')
  await ui.unmount()
})

test('progress from an earlier session is remembered', async ($, on) => {
  const unticked = PLAN_TEXT.replaceAll('[x]', '[ ]')
  engine(on, { [PLAN_PATH]: unticked }, { [`progress:${PLAN_PATH}`]: 2 })
  await measure($, 20)
  await $.tool.call({ tool: 'Read', file_path: PLAN_PATH })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const text = await bandText(ui)
  expect(text).toContain('2/3')
  expect(text).toContain('Wire up login')
  await ui.unmount()
})

test('/ctxbar hides and shows the bar', async ($, on) => {
  engine(on, {})
  await measure($, 10)
  const toggle = () =>
    $.command.run({
      command: 'ctxbar',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 120 },
    })

  await toggle()
  const hidden = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await bandText(hidden)).not.toContain('ctx')
  await hidden.unmount()

  await toggle()
  const shown = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await bandText(shown)).toContain('ctx')
  await shown.unmount()
})

test('/clear keeps the plan bar, found again with no session.start after it', async ($, on) => {
  engine(on, { [PLAN_PATH]: PLAN_TEXT })
  mock.clock(on, { now: Date.parse('2026-10-20T12:00:00Z') })
  on('fs.list', () => ({
    value: [{ name: '2026-10-19-auth.md', kind: 'file', size: 1, mtimeMs: Date.parse('2026-10-19T12:00:00Z'), isLink: false }],
  }))
  on('fs.exists', () => ({ value: false }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }) as never)
  await measure($, 20)
  await $.tool.call({ tool: 'Read', file_path: PLAN_PATH })
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} as never })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await bandText(ui)).toContain('1/3')
  await ui.unmount()
})
