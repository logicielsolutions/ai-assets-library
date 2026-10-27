import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLAN_PATH = '/work/app/docs/superpowers/plans/2026-10-14-backbone.md'

const plan = (box: string) => `# Backbone Implementation Plan

### Task 1: Config

- Create: \`src/config.py\`

- [${box}] **Step 1: Write it**

### Task 2: Retrieval

- Modify: \`src/kb/retrieve.py\`

- [${box}] **Step 1: Write it**
`
const FINISHED = plan('x')
const OPEN = plan(' ')

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

function engine(on: On, files: Record<string, string>) {
  mock.clock(on, { now: Date.parse('2026-10-21T20:00:00Z') })
  mock.store(on, {})
  on('session.cwd', () => ({ value: '/work/app' }))
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('fs.read', ($, e) => {
    const text = files[e.path]
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  on('fs.list', ($, e) => ({
    value: e.path.endsWith('docs/superpowers/plans')
      ? Object.keys(files)
          .filter(f => f.startsWith(`${e.path}/`))
          .map(f => ({ name: f.split('/').pop()!, kind: 'file' as const, size: 1, mtimeMs: Date.parse('2026-10-21T19:00:00Z'), isLink: false }))
      : [],
  }))
  on('fs.exists', () => ({ value: false }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', { tool: 'TaskCreate' }, ($, e) => ({ result: {} as never, text: `Task #${e.subject.length} created successfully` }))
  on('tool.call', () => ({ result: {} as never, text: 'ok' }))
  // The engine's own band is empty
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
}

async function band($: Engine): Promise<string> {
  const flatten = (node: unknown): string =>
    typeof node === 'string'
      ? node
      : node !== null && typeof node === 'object' && 'children' in node
        ? ((node as { children: unknown[] }).children ?? []).map(flatten).join('')
        : ''
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const text = flatten(await ui.drawn())
  await ui.unmount()
  return text
}

let turns = 0
async function prompt($: Engine, text: string, work: () => Promise<unknown> = async () => undefined) {
  const turnId = `t${++turns}`
  await $.turn.start({ text, turnId })
  await work()
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId, reason: 'answer' })
}

test('a finished plan is never picked up by itself', async ($, on) => {
  engine(on, { [PLAN_PATH]: FINISHED })
  await prompt($, 'run RAGAS')
  expect(await band($)).not.toContain('plan ')
})

test('an unfinished plan is picked up, and stays through unrelated prompts', async ($, on) => {
  engine(on, { [PLAN_PATH]: OPEN })
  await prompt($, 'continue')
  expect(await band($)).toContain('0/2')
  await prompt($, 'what is the weather like', () => $.tool.call({ tool: 'Bash', command: 'date', description: 'Check the date' }))
  expect(await band($)).toContain('0/2')
})

test('a finished plan stays while prompts open it, and goes after one that does not', async ($, on) => {
  engine(on, { [PLAN_PATH]: FINISHED })
  // "what did you do in this plan": Claude reads it
  await prompt($, 'what did you do in this plan', () => $.tool.call({ tool: 'Read', file_path: PLAN_PATH }))
  expect(await band($)).toContain('2/2')
  await prompt($, 'which tasks touched retrieval', () =>
    $.tool.call({ tool: 'Grep', pattern: 'retrieve', path: PLAN_PATH }))
  expect(await band($)).toContain('2/2')
  // Work on code the plan built is not the plan: it may be anything now
  await prompt($, 'run RAGAS', () =>
    $.tool.call({ tool: 'Edit', file_path: '/work/app/src/kb/retrieve.py', old_string: 'a', new_string: 'b' }))
  expect(await band($)).not.toContain('2/2')
})

test('a new task list takes over from a finished plan', async ($, on) => {
  engine(on, { [PLAN_PATH]: FINISHED })
  await $.turn.start({ text: 'what was in the plan', turnId: 'a' })
  await $.tool.call({ tool: 'Read', file_path: PLAN_PATH })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Smoke-run RAGAS', description: 'x' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Full RAGAS run', description: 'y' })
  const text = await band($)
  expect(text).toContain('tasks')
  expect(text).toContain('0/2')
  expect(text).toContain('Smoke-run RAGAS')
  expect(text).not.toContain('plan ')
})

test('with no plan and no list, the band shows what is running', async ($, on) => {
  engine(on, {})
  const engineSide = $
  on('tool.call', { tool: 'Bash' }, async () => {
    const text = await band(engineSide)
    expect(text).toContain('no plan')
    expect(text).toContain('Bash: Probe RAGAS inputs')
    expect(text).toContain('1 steps')
    return { result: {} as never, text: 'ok' }
  })
  await $.turn.start({ text: 'run RAGAS', turnId: 'r' })
  await $.tool.call({ tool: 'Bash', command: 'python probe.py', description: 'Probe RAGAS inputs' })
  // Once the prompt is answered, the activity line goes
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'r', reason: 'answer' })
  expect(await band($)).not.toContain('no plan')
})

test('a plan-mode plan counts its numbered steps', async ($, on) => {
  const path = '/home/me/.claude/plans/happy-otter.md'
  engine(on, {
    [path]: `# Add rerank toggle\n\n## Context\n\nwhy\n\n### 1. Add the setting\n\n### 2. Wire it into retrieve\n\n### 3. Test it\n`,
  })
  await $.turn.start({ text: 'plan it', turnId: 'p' })
  await $.tool.call({ tool: 'Write', file_path: path, content: 'x' })
  const text = await band($)
  expect(text).toContain('0/3')
  expect(text).toContain('not started')
})

test('brainstorming shows as planning, through prompts that use no tools', async ($, on) => {
  engine(on, {})
  await prompt($, 'lets plan the COMPARISON bucket', () =>
    $.tool.call({ tool: 'Skill', skill: 'superpowers:brainstorming' }))
  expect(await band($)).toContain('planning (superpowers:brainstorming)')
  // Answering its questions
  await prompt($, 'DuckDB, and keep it under 300 ms')
  expect(await band($)).toContain('planning (superpowers:brainstorming)')
})

test('editing a superpowers spec is planning, with no skill seen', async ($, on) => {
  engine(on, {})
  await $.turn.start({ text: 'fix the spec', turnId: 's' })
  await $.tool.call({ tool: 'Read', file_path: '/work/app/docs/superpowers/specs/2026-10-21-chat-demo-design.md' })
  expect(await band($)).not.toContain('planning')
  await $.tool.call({
    tool: 'Edit',
    file_path: '/work/app/docs/superpowers/specs/2026-10-21-chat-demo-design.md',
    old_string: 'a',
    new_string: 'b',
  })
  expect(await band($)).toContain('planning (spec: chat-demo-design)')
})

test('a checklist made while planning shows inside the planning label', async ($, on) => {
  engine(on, {})
  await $.turn.start({ text: 'plan it', turnId: 'b' })
  await $.tool.call({ tool: 'Skill', skill: 'superpowers:brainstorming' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Ask clarifying questions', description: 'x' })
  const text = await band($)
  expect(text).toContain('planning (superpowers:brainstorming)')
  expect(text).toContain('0/1')
  expect(text).toContain('Ask clarifying questions')
})

test('superpowers: brainstorm, write the plan, then carry it out', async ($, on) => {
  const files: Record<string, string> = {}
  engine(on, files)
  await prompt($, 'plan it', () => $.tool.call({ tool: 'Skill', skill: 'superpowers:brainstorming' }))
  await prompt($, 'write it up', async () => {
    await $.tool.call({ tool: 'Skill', skill: 'superpowers:writing-plans' })
    files[PLAN_PATH] = OPEN
    await $.tool.call({ tool: 'Write', file_path: PLAN_PATH, content: OPEN })
  })
  const written = await band($)
  expect(written).toContain('0/2')
  expect(written).toContain('not started')

  await $.turn.start({ text: 'go', turnId: 'go' })
  await $.tool.call({ tool: 'Skill', skill: 'superpowers:executing-plans' })
  // Skill loaded, no task underway yet: checking the plan against the code
  const preflight = await band($)
  expect(preflight).toContain('0/2')
  expect(preflight).toContain('pre-flight')
  expect(preflight).not.toContain('not started')
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Config', status: 'in_progress', activeForm: 'Writing config' }] })
  const working = await band($)
  expect(working).toContain('0/2')
  expect(working).not.toContain('not started')
  expect(working).not.toContain('pre-flight')
  expect(working).not.toContain('planning')
})

test('a subagent-driven-development ledger drives the plan bar', async ($, on) => {
  const LEDGER = '/work/app/.superpowers/sdd/2026-10-14-backbone/progress.md'
  const files: Record<string, string> = { [PLAN_PATH]: OPEN }
  engine(on, files)
  files[LEDGER] = '# SDD ledger — plan: docs/superpowers/plans/2026-10-14-backbone.md\n\n## Pre-flight conflict scan\n'
  await $.turn.start({ text: 'go', turnId: 'go' })
  await $.tool.call({ tool: 'Read', file_path: PLAN_PATH })
  // A ledger with nothing complete: setup and the conflict scan
  const preflight = await band($)
  expect(preflight).toContain('0/2')
  expect(preflight).toContain('pre-flight')
  // The controller logs Task 1 done; the bar moves on that call, mid-turn
  files[LEDGER] += 'Task 1: complete (commits aaaaaaa..bbbbbbb, review clean)\n'
  await $.tool.call({ tool: 'Bash', command: `echo done >> ${LEDGER}`, description: 'Log Task 1' })
  const working = await band($)
  expect(working).toContain('1/2')
  expect(working).toContain('Retrieval')
  expect(working).not.toContain('pre-flight')
})

test('plan mode shows as planning until the plan is approved', async ($, on) => {
  engine(on, {})
  await $.turn.start({ text: 'add a rerank toggle', turnId: 'pm' })
  await $.tool.call({ tool: 'EnterPlanMode' })
  await $.tool.call({ tool: 'Read', file_path: '/work/app/src/kb/retrieve.py' })
  expect(await band($)).toContain('planning (plan mode)')
  await $.tool.call({ tool: 'ExitPlanMode' })
  expect(await band($)).not.toContain('planning')
})
