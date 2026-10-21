import type { Plan, PlanTask, TodoItem } from '../types'

// Superpowers' writing-plans skill saves to docs/superpowers/plans/<date>-<name>.md
export const PLAN_DIR = 'docs/superpowers/plans'

const TASK_HEADING = /^#{2,4}\s+Task\s+(\d+[a-z]?)\b\s*[:.\-–—]?\s*(.*)$/i

// A plan path anywhere in a tool's input: a Read, a grep, a sed in a shell
// command. Superpowers plans live in the project; plan mode's in ~/.claude/plans.
const PLAN_IN_TEXT = /[^\s'"`]*(?:docs\/superpowers|\.claude)\/plans\/[^\s'"`/]+\.md/
// A plan with no "Task N" headings and no checkboxes, as plan mode writes
// them, counts its numbered headings ("### 1. Add the route", "## Step 2: ...")
const NUMBERED_HEADING = /^#{2,4}\s+(?:(?:Step|Phase|Part)\s+)?(\d+)[.:)]?\s+(.*)$/i
const CHECKBOX = /^\s*[-*]\s+\[([ xX])\]/
// The files a task says it creates: "- Create: `src/app/config.py`"
const CREATES = /^\s*[-*]\s+Create:\s*`([^`]+)`/

export function parsePlan(path: string, text: string): Plan {
  const lines = text.split('\n')
  const titleLine = lines.find(l => /^#\s+/.test(l))
  const title = (titleLine ?? path.split('/').pop() ?? 'Plan')
    .replace(/^#\s+/, '')
    .replace(/\s+Implementation Plan$/i, '')
    .replace(/\.md$/, '')
    .trim()

  const tasks: PlanTask[] = []
  let current: { name: string; checked: number; boxes: number; creates: string[] } | null = null
  let stepsDone = 0
  let stepsTotal = 0

  const close = () => {
    if (current !== null) {
      tasks.push({
        name: current.name,
        isDone: current.boxes > 0 && current.checked === current.boxes,
        creates: current.creates,
      })
    }
  }

  for (const line of lines) {
    const heading = TASK_HEADING.exec(line)
    if (heading !== null) {
      close()
      current = { name: heading[2]!.trim() || `Task ${heading[1]}`, checked: 0, boxes: 0, creates: [] }
      continue
    }
    const created = CREATES.exec(line)
    if (created !== null && current !== null) current.creates.push(created[1]!.split(':')[0]!.trim())
    const box = CHECKBOX.exec(line)
    if (box !== null) {
      const isChecked = box[1] !== ' '
      stepsTotal += 1
      if (isChecked) stepsDone += 1
      if (current !== null) {
        current.boxes += 1
        if (isChecked) current.checked += 1
      }
    }
  }
  close()

  if (tasks.length === 0 && stepsTotal === 0) {
    for (const line of lines) {
      const numbered = NUMBERED_HEADING.exec(line)
      if (numbered !== null) tasks.push({ name: numbered[2]!.trim(), isDone: false, creates: [] })
    }
  }

  return { path, title, tasks, stepsDone, stepsTotal, remembered: 0 }
}

export function isFinished(progress: Progress | null): boolean {
  return progress !== null && progress.done >= progress.total
}

// A call is about the plan when it names the plan file. Not the files the plan
// names: a plan that built the codebase names most of it, so later work on that
// code would keep a finished plan up for good.
export function touchesPlan(plan: Plan, callText: string): boolean {
  return callText.includes(plan.path.split('/').pop()!)
}

export type Progress = { done: number; total: number; current: string | null }

// Few executors tick the boxes, so a task also counts as done once every file
// it creates exists. A task that creates nothing (an amendment slotted in as
// "Task 7a") counts as done once a later task is.
export function markBuilt(plan: Plan, exists: (path: string) => boolean): Plan {
  const built = plan.tasks.map(
    t => t.isDone || (t.creates.length > 0 && t.creates.every(exists)),
  )
  const tasks = plan.tasks.map((t, i) => ({
    ...t,
    isDone: built[i]! || (t.creates.length === 0 && built.slice(i + 1).some(Boolean)),
  }))
  return { ...plan, tasks }
}

// The project a plan belongs to: the folder above docs/superpowers/plans.
// Null for a plan kept elsewhere (plan mode's), whose paths are the session's.
export function projectRoot(planPath: string): string | null {
  const root = planPath.replace(/\/?docs\/superpowers\/plans\/[^/]+$/, '')
  return root === planPath ? null : root || '.'
}

export function planPathIn(text: string): string | null {
  return PLAN_IN_TEXT.exec(text)?.[0] ?? null
}

// The plan file sets the total. Progress is whichever moved furthest: ticked
// checkboxes in the file, completed todos (superpowers' executors track tasks
// as todos and rarely tick the file), or what an earlier session got to.
export function planProgress(
  plan: Plan,
  todos: readonly TodoItem[],
  remembered = 0,
): Progress | null {
  const byTask = plan.tasks.length > 0
  const total = byTask ? plan.tasks.length : plan.stepsTotal
  if (total === 0) return null

  const fileDone = byTask ? plan.tasks.filter(t => t.isDone).length : plan.stepsDone
  const todoDone = Math.min(todos.filter(t => t.status === 'completed').length, total)
  const done = Math.min(Math.max(fileDone, todoDone, remembered), total)

  const active = todos.find(t => t.status === 'in_progress')
  const nextTask = byTask
    ? (fileDone >= done ? plan.tasks.find(t => !t.isDone) : plan.tasks[done])
    : undefined
  const current = done >= total ? null : (active?.content ?? nextTask?.name ?? null)

  return { done, total, current }
}

export function bar(ratio: number, width: number): string {
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export function shortTokens(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`
}

// Task ids come back in the result text, e.g. "Task #3 created successfully: ..."
export function taskIdFrom(text: string | undefined): string | null {
  const match = /#(\d+)/.exec(text ?? '')
  return match === null ? null : match[1]!
}
