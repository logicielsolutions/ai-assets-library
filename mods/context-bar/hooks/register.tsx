import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage } from 'claude-code'

import type { ContextFill, Plan, Planning, Step, TodoItem, Turn } from '../types'
import { bar, isFinished, markBuilt, parsePlan, PLAN_DIR, planPathIn, planProgress, projectRoot, shortTokens, taskIdFrom, touchesPlan } from './plan'
import { countDone, describeCall, duration, estimateLeft, keepRecent, methodOf, planningChange } from './progress'

const context = atom({ plugin: 'context-bar', key: 'context' } as const, null as ContextFill | null)
const plan = atom({ plugin: 'context-bar', key: 'plan' } as const, null as Plan | null)
const todos = atom({ plugin: 'context-bar', key: 'todos' } as const, [] as TodoItem[])
const isHidden = atom({ plugin: 'context-bar', key: 'isHidden' } as const, false)
const turn = atom({ plugin: 'context-bar', key: 'turn' } as const, null as Turn | null)
const steps = atom({ plugin: 'context-bar', key: 'steps' } as const, [] as Step[])
const now = atom({ plugin: 'context-bar', key: 'now' } as const, 0)
const todosStartedAt = atom({ plugin: 'context-bar', key: 'todosStartedAt' } as const, null as number | null)
const isPaneClosed = atom({ plugin: 'context-bar', key: 'isPaneClosed' } as const, false)
const isPlanTouched = atom({ plugin: 'context-bar', key: 'isPlanTouched' } as const, false)
const planning = atom({ plugin: 'context-bar', key: 'planning' } as const, null as Planning | null)

const PANE = 'progress'

// Ticks the pane's clock once a second while a turn runs. A reload drops the
// timer with the old module, so session.start starts it again mid-turn.
let ticker: { cancel: () => void } | null = null

async function startTicking($: EngineInterface): Promise<void> {
  ticker?.cancel()
  const t = await $.clock.now()
  await update($, now, () => t)
  ticker = $.clock.every(1000, () => {
    void $.clock.now().then(t => update($, now, () => t))
  })
}

function stopTicking(): void {
  ticker?.cancel()
  ticker = null
}

// A new task list begins when none is open: the estimate's pace starts there,
// and a finished plan gives way to it, the list being the work now
async function noteListStart($: EngineInterface, before: readonly TodoItem[]): Promise<void> {
  if (before.length === 0 || countDone(before) === before.length) {
    const t = await $.clock.now()
    await update($, todosStartedAt, () => t)
    if (await isPlanFinished($)) await update($, plan, () => null)
  }
}

async function isPlanFinished($: EngineInterface): Promise<boolean> {
  const active = await read($, plan)
  return active !== null && isFinished(planProgress(active, await read($, todos), active.remembered))
}

function fillFrom(usage: SessionContextUsage): ContextFill | null {
  if (usage.percent === undefined || usage.tokens === undefined) return null
  return { percent: usage.percent, tokens: usage.tokens, window: usage.window }
}

// A plan touched in the last two weeks counts as the one being worked on
const RECENT_MS = 14 * 24 * 60 * 60 * 1000

async function absolute($: EngineInterface, path: string): Promise<string> {
  if (path.startsWith('/')) return path
  if (path.startsWith('~/')) return `${(await $.env.get('HOME')) ?? ''}/${path.slice(2)}`
  return `${await $.session.cwd()}/${path.replace(/^\.\//, '')}`
}

async function loadPlan($: EngineInterface, path: string): Promise<void> {
  const full = await absolute($, path)
  const text = await $.fs.read(full).catch(() => null)
  // How far an earlier session got, since todos don't outlive a restart
  const remembered = Number((await $.store.get(`progress:${full}`)) ?? 0)
  if (text === null) {
    // A plan file that was deleted or can't be read takes the plan section away
    await update($, plan, () => null)
    return
  }
  const parsed = parsePlan(full, text)
  const root = projectRoot(full) ?? (await $.session.cwd())
  const files = [...new Set(parsed.tasks.flatMap(t => t.creates))]
  const present = new Set<string>()
  for (const file of files) {
    if (await $.fs.exists(file.startsWith('/') ? file : `${root}/${file}`).catch(() => false)) {
      present.add(file)
    }
  }
  const built = markBuilt(parsed, file => present.has(file))
  await update($, plan, () => ({ ...built, remembered }))
}

// The project's newest superpowers plan, when it was touched recently
async function findRecentPlan($: EngineInterface): Promise<string | null> {
  const dir = `${await $.session.cwd()}/${PLAN_DIR}`
  const entries = await $.fs.list(dir).catch(() => [])
  const newest = entries
    .filter(f => f.kind === 'file' && f.name.endsWith('.md'))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
  const isRecent = newest !== undefined && (await $.clock.now()) - newest.mtimeMs < RECENT_MS
  return isRecent ? `${dir}/${newest.name}` : null
}

// Picks up a recent superpowers plan that still has work left. A finished one
// comes back only when a prompt touches it (tool.call), never by itself.
async function discoverPlan($: EngineInterface): Promise<void> {
  if ((await read($, plan)) !== null) return
  const found = await findRecentPlan($)
  if (found === null) return
  await loadPlan($, found)
  if (await isPlanFinished($)) await update($, plan, () => null)
}

async function startStep(
  $: EngineInterface,
  e: { tool: string; tool_use_id?: string; agentId?: string },
): Promise<Step> {
  const { tool_use_id: id, ...input } = e as unknown as Record<string, unknown> & { tool_use_id?: string }
  const t = await $.clock.now()
  const step: Step = {
    id: id ?? `${e.tool}-${t}`,
    tool: e.tool,
    detail: describeCall(input),
    startedAt: t,
    ...(e.agentId === undefined ? {} : { agent: e.agentId }),
  }
  const method = methodOf(e.tool, input)
  await update($, steps, list => keepRecent([...list, step]))
  await update($, turn, current =>
    current === null
      ? current
      : { ...current, toolCount: current.toolCount + 1, method: method ?? current.method },
  )
  return step
}

async function rememberProgress($: EngineInterface): Promise<void> {
  const active = await read($, plan)
  if (active === null) return
  const progress = planProgress(active, await read($, todos), active.remembered)
  if (progress !== null && progress.done > active.remembered) {
    await $.store.set(`progress:${active.path}`, progress.done)
    await update($, plan, p => (p === null ? p : { ...p, remembered: progress.done }))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ctxbar',
      description: 'Show or hide the context and plan bar above the prompt',
    })
    const { context: usage } = await $.session.usage()
    await update($, context, () => fillFrom(usage))
    await discoverPlan($)
    await $.command.register({
      name: 'progress',
      description: 'Open the work-progress pane: prompt, tasks, plan and live steps',
    })
    const current = await read($, turn)
    if (current !== null && current.endedAt === undefined) await startTicking($)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // A plan is the project's, not the conversation's, so /clear keeps showing it.
    // No session.start follows a clear, so look for the plan again right here.
    if (e.reason === 'clear') {
      await update($, todos, () => [])
      await update($, context, () => null)
      await update($, plan, () => null)
      await update($, planning, () => null)
      await discoverPlan($).catch(() => undefined)
    }

    return next(e)
  })

  on('command.run', { command: 'ctxbar' }, async $ => {
    const hidden = await update($, isHidden, h => !h)

    return { text: hidden ? 'Context bar hidden.' : 'Context bar shown.' }
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, context, () => fillFrom(e.context))
    }

    return next(e)
  })

  // These hooks only watch tool calls. Each `.catch` lets the call go on as
  // if the mod were not there should the hook fail (next replays the result
  // when it already ran).

  // Any tool that names a plan (a Read, a grep, a sed) makes it the active plan,
  // even when the call fails: a too-big Read still means it's in use. A call
  // naming the plan or a file it names marks this prompt as about the plan.
  // Every call, the main loop's and its subagents', is also a step in the pane
  on('tool.call', async ($, e, next) => {
    // The pane's bookkeeping never costs the plan bar: a failure here is dropped
    const step = await startStep($, e).catch(() => null)
    const ran = await next(e)
    if (step !== null) {
      const isError = ran.deny !== undefined || ran.isError === true
      await $.clock
        .now()
        .then(t => update($, steps, list => list.map(s => (s.id === step.id ? { ...s, endedAt: t, isError } : s))))
        .catch(() => undefined)
    }
    const { tool_use_id: _, ...input } = e
    const callText = JSON.stringify(input)
    const path = planPathIn(callText)
    if (path !== null) await loadPlan($, path)
    const active = await read($, plan)
    if (active !== null && (path !== null || touchesPlan(active, callText))) {
      await update($, isPlanTouched, () => true)
    }
    const change = planningChange(e.tool, input as Record<string, unknown>, ran.deny === undefined && ran.isError !== true)
    if (change === 'end') await update($, planning, () => null)
    else if (change !== null) {
      const t = await $.clock.now()
      // Brainstorming then writing-plans is one planning stretch: keep its start
      await update($, planning, p => ({ method: change.begin, startedAt: p?.startedAt ?? t }))
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await noteListStart($, await read($, todos))
      await update($, todos, (): TodoItem[] =>
        e.todos.map((t, i) => ({ id: `w${i}`, content: t.content, status: t.status })),
      )
      await rememberProgress($)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    const id = ran.deny === undefined && ran.isError !== true ? taskIdFrom(ran.text) : null
    if (id !== null) {
      await noteListStart($, await read($, todos))
      await update($, todos, (list): TodoItem[] => [
        ...list.filter(t => t.id !== id),
        { id, content: e.subject, status: 'pending' },
      ])
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      const status = e.status
      await update($, todos, (list): TodoItem[] =>
        status === 'deleted'
          ? list.filter(t => t.id !== e.taskId)
          : list.map(t =>
              t.id === e.taskId
                ? { ...t, content: e.subject ?? t.content, status: status ?? t.status }
                : t,
            ),
      )
      await rememberProgress($)
    }

    return ran
  }).catch(($, e, next) => next(e))

  // Catches plan edits made some other way (a subagent, a shell command)
  // and finds a plan written since the session started (or since a /clear)
  on('turn.complete', async ($, e, next) => {
    const active = await read($, plan)
    if (active !== null) await loadPlan($, active.path)
    else await discoverPlan($)
    if (e.agentId === undefined) {
      // A finished plan this prompt never touched is done with: hide it
      if ((await isPlanFinished($)) && !(await read($, isPlanTouched))) {
        await update($, plan, () => null)
      }
      // A plan with a task done is being carried out, no longer made
      const working = await read($, plan)
      const workingProgress = working === null ? null : planProgress(working, await read($, todos), working.remembered)
      if (workingProgress !== null && workingProgress.done > 0) await update($, planning, () => null)
      stopTicking()
      const t = await $.clock.now()
      await update($, turn, current =>
        current === null ? current : { ...current, endedAt: t, reason: e.reason },
      )
      await update($, now, () => t)
    }

    return next(e)
  })

  on('command.run', { command: 'progress' }, async $ => {
    await update($, isPaneClosed, () => false)
    const opened = await $.ui.open({ id: PANE, title: 'Progress' })

    return { text: opened.isPlaced ? 'Progress pane opened.' : 'Progress pane opens once the terminal is wider.' }
  })

  // A pane the person closed stays closed across reloads, until /progress
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') await update($, isPaneClosed, () => true)

    return next(e)
  })

  // Each prompt starts a fresh view; a continuation ("" text) keeps the one shown
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const t = await $.clock.now()
      const before = await read($, turn)
      const isNewPrompt = e.text.trim() !== '' || before === null
      await update($, turn, (): Turn => ({
        prompt: isNewPrompt ? e.text.trim() : before!.prompt,
        startedAt: isNewPrompt ? t : before!.startedAt,
        toolCount: isNewPrompt ? 0 : before!.toolCount,
        method: isNewPrompt ? null : before!.method,
      }))
      if (isNewPrompt) {
        await update($, steps, () => [])
        await update($, isPlanTouched, () => false)
      }
      await startTicking($)
      // A plan written since the last turn shows from this one on
      await discoverPlan($).catch(() => undefined)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const columns = Math.max(20, e.props.bodyColumns)
    const rows = Math.max(8, e.props.scroll.bodyRows)
    const current = await read($, turn)
    const list = await read($, todos)
    const active = await read($, plan)
    const recent = await read($, steps)
    const clock = await read($, now)
    const listStart = await read($, todosStartedAt)
    const making = await read($, planning)
    const progress = active === null ? null : planProgress(active, list, active.remembered)

    const at = current?.endedAt ?? (clock || current?.startedAt || 0)
    const isRunning = current !== null && current.endedAt === undefined
    const width = Math.min(20, Math.max(8, columns - 22))
    const done = countDone(list)
    const left = listStart === null ? null : estimateLeft(listStart, at, done, list.length)

    const section = (title: string) => (
      <Text key={`h-${title}`} bold color="suggestion">{title}</Text>
    )

    const header = current === null ? (
      <Text key="idle" dimColor>No prompt yet. Progress shows here as Claude works.</Text>
    ) : (
      <Box key="turn" flexDirection="column">
        <Text wrap="truncate-end">
          <Text dimColor>prompt </Text>
          {current.prompt === '' ? '(continuation)' : current.prompt.split('\n')[0]}
        </Text>
        <Text>
          <Text color={isRunning ? 'warning' : current.reason === 'answer' ? 'success' : 'error'}>
            {isRunning ? '● working' : current.reason === 'answer' ? '✓ done' : `✗ ${current.reason ?? 'stopped'}`}
          </Text>
          <Text dimColor> · {duration(at - current.startedAt)} · {current.toolCount} tools</Text>
          {current.method !== null ? <Text dimColor> · {current.method}</Text> : null}
        </Text>
        {making !== null ? (
          <Text wrap="truncate-end">
            <Text color="suggestion">planning</Text>
            <Text dimColor> ({making.method}) · since {duration(Math.max(at, making.startedAt) - making.startedAt)}</Text>
          </Text>
        ) : null}
      </Box>
    )

    const taskRows = list.length === 0 ? [] : [
      section('Tasks'),
      <Text key="t-bar">
        <Text color="suggestion">{bar(done / list.length, width)}</Text>
        <Text bold> {done}/{list.length}</Text>
        {left !== null ? <Text dimColor> · ~{duration(left)} left (est.)</Text> : null}
      </Text>,
      ...list.map(t => (
        <Text key={`t-${t.id}`} wrap="truncate-end" dimColor={t.status === 'completed'}>
          <Text color={t.status === 'completed' ? 'success' : t.status === 'in_progress' ? 'warning' : undefined}>
            {t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '▸' : '○'}
          </Text> {t.content}
        </Text>
      )),
    ]

    const planRows = active === null || progress === null ? [] : [
      section('Plan'),
      <Text key="p-title" wrap="truncate-end">
        <Text color={progress.done >= progress.total ? 'success' : 'suggestion'}>{bar(progress.done / progress.total, width)}</Text>
        <Text bold> {progress.done}/{progress.total}</Text>
        <Text dimColor> {active.title}</Text>
      </Text>,
      // The plan's own tasks, up to the one being worked on and a few after it
      ...active.tasks.slice(Math.max(0, progress.done - 2), progress.done + 4).map((t, i) => {
        const index = Math.max(0, progress.done - 2) + i
        const isDone = index < progress.done
        const isNext = index === progress.done
        return (
          <Text key={`p-${index}`} wrap="truncate-end" dimColor={isDone}>
            <Text color={isDone ? 'success' : isNext ? 'warning' : undefined}>{isDone ? '✓' : isNext ? '▸' : '○'}</Text> {t.name}
          </Text>
        )
      }),
    ]

    const used = 3 + taskRows.length + planRows.length
    const room = Math.max(3, rows - used - 2)
    const running = recent.filter(s => s.endedAt === undefined)
    const finished = recent.filter(s => s.endedAt !== undefined).slice(-Math.max(1, room - running.length - 1)).reverse()
    const stepRow = (s: Step, isLive: boolean) => (
      <Text key={`s-${s.id}`} wrap="truncate-end" dimColor={!isLive}>
        <Text color={isLive ? 'warning' : s.isError ? 'error' : 'success'}>{isLive ? '▸' : s.isError ? '✗' : '✓'}</Text>
        {s.agent !== undefined ? <Text dimColor> ↳</Text> : null}
        <Text bold={isLive}> {s.tool}</Text>
        {s.detail !== '' ? <Text> {s.detail}</Text> : null}
        <Text dimColor> {duration((s.endedAt ?? at) - s.startedAt)}</Text>
      </Text>
    )
    const stepRows = recent.length === 0 ? [] : [
      section(running.length > 0 ? 'Now' : 'Recent steps'),
      ...running.map(s => stepRow(s, true)),
      ...(running.length > 0 && finished.length > 0 ? [<Text key="h-recent" dimColor>recent</Text>] : []),
      ...finished.map(s => stepRow(s, false)),
    ]

    return (
      <Box flexDirection="column" width={columns}>
        {header}
        {taskRows}
        {planRows}
        {stepRows}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const fill = await read($, context)
    const active = await read($, plan)
    const list = await read($, todos)
    const progress = active === null ? null : planProgress(active, list, active.remembered)
    const current = await read($, turn)
    const isRunning = current !== null && current.endedAt === undefined
    // Without a plan, a task list shows while it is open or was made this prompt
    const listStart = await read($, todosStartedAt)
    const showsTasks =
      progress === null &&
      list.length > 0 &&
      (countDone(list) < list.length || (current !== null && listStart !== null && listStart >= current.startedAt))
    const making = await read($, planning)
    const showsActivity = progress === null && !showsTasks && isRunning
    if (fill === null && progress === null && !showsTasks && !showsActivity && making === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const columns = e.props.bodyColumns
    const isWide = columns >= 90
    const width = isWide ? 12 : 8

    const ctxColor = fill === null ? 'subtle' : fill.percent >= 85 ? 'error' : fill.percent >= 60 ? 'warning' : 'success'
    const ctx = fill === null ? null : (
      <Text key="ctx">
        <Text dimColor>ctx </Text>
        <Text color={ctxColor}>{bar(fill.percent / 100, width)}</Text>
        <Text bold> {fill.percent}%</Text>
        {isWide ? <Text dimColor> {shortTokens(fill.tokens)}/{shortTokens(fill.window)}</Text> : null}
        {fill.percent >= 85 ? <Text color="error"> · /compact soon</Text> : null}
      </Text>
    )

    const isComplete = isFinished(progress)
    const planRow = progress === null ? null : (
      <Text key="plan" wrap="truncate-end">
        <Text dimColor>plan </Text>
        <Text color={isComplete ? 'success' : 'suggestion'}>{bar(progress.done / progress.total, width)}</Text>
        <Text bold> {progress.done}/{progress.total}</Text>
        {isComplete ? (
          <Text color="success"> ✓ {active!.title}</Text>
        ) : progress.done === 0 && !list.some(t => t.status === 'in_progress') ? (
          <Text dimColor> · not started · {active!.title}</Text>
        ) : progress.current !== null ? (
          <Text dimColor> · {progress.current}</Text>
        ) : null}
      </Text>
    )

    const done = countDone(list)
    const doing = list.find(t => t.status === 'in_progress') ?? list.find(t => t.status === 'pending')
    const tasksRow = !showsTasks ? null : (
      <Text key="tasks" wrap="truncate-end">
        <Text dimColor>tasks </Text>
        <Text color={done === list.length ? 'success' : 'suggestion'}>{bar(done / list.length, width)}</Text>
        <Text bold> {done}/{list.length}</Text>
        {done === list.length ? <Text color="success"> ✓ done</Text> : doing !== undefined ? <Text dimColor> · {doing.content}</Text> : null}
      </Text>
    )

    // No plan and no list: what Claude is doing right now, and for how long
    let activityRow = null
    if (showsActivity) {
      const clock = await read($, now)
      const recent = await read($, steps)
      const live = [...recent].reverse().find(s => s.endedAt === undefined && s.agent === undefined)
        ?? [...recent].reverse().find(s => s.endedAt === undefined)
      const last = live ?? recent[recent.length - 1]
      const elapsed = duration(Math.max(clock, current!.startedAt) - current!.startedAt)
      activityRow = (
        <Text key="activity" wrap="truncate-end">
          {making === null ? <Text dimColor>no plan · </Text> : null}
          {last === undefined ? (
            <Text color="warning">● working</Text>
          ) : (
            <Text>
              <Text color={live !== undefined ? 'warning' : 'subtle'}>{live !== undefined ? '▸ ' : ''}</Text>
              <Text bold={live !== undefined}>{last.tool}</Text>
              {last.detail !== '' ? <Text>: {last.detail}</Text> : null}
            </Text>
          )}
          <Text dimColor> · {current!.toolCount} steps · {elapsed}</Text>
        </Text>
      )
    }

    // A plan being made, before its file exists (or while it has no steps to
    // count): the label, then the list or the step underway
    const planningRow = making === null || planRow !== null ? null : (
      <Text key="planning" wrap="truncate-end">
        <Text color="suggestion">planning</Text>
        <Text dimColor> ({making.method})</Text>
        {tasksRow !== null ? <Text dimColor> · </Text> : null}
        {tasksRow}
        {tasksRow === null && activityRow !== null ? <Text dimColor> · </Text> : null}
        {tasksRow === null ? activityRow : null}
      </Text>
    )

    const workRow = planRow ?? planningRow ?? tasksRow ?? activityRow

    // One row when there is room, stacked on narrow terminals
    if (ctx !== null && workRow !== null && isWide) {
      return (
        <Box flexDirection="row">
          <Box flexShrink={0}>{ctx}</Box>
          <Text dimColor>  │  </Text>
          {workRow}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {ctx}
        {workRow}
      </Box>
    )
  })
}
