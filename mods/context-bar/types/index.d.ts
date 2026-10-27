export type ContextFill = { percent: number; tokens: number; window: number }

export type PlanTask = {
  /** The number in its "Task N" heading ("7a"), or its position for a plan without them */
  id: string
  name: string
  isDone: boolean
  creates: string[]
}

export type Plan = {
  path: string
  title: string
  tasks: PlanTask[]
  stepsDone: number
  stepsTotal: number
  /** Tasks done as far as an earlier session got */
  remembered: number
  /** Whether subagent-driven-development keeps a ledger for this plan: it is being carried out */
  hasLedger?: boolean
}

export type TodoItem = {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

/** One tool call, as the progress pane lists it */
export type Step = {
  id: string
  tool: string
  detail: string
  /** Set when a subagent made the call */
  agent?: string
  startedAt: number
  endedAt?: number
  isError?: boolean
}

/** The prompt being worked on, from its turn's start */
export type Turn = {
  prompt: string
  startedAt: number
  endedAt?: number
  reason?: string
  toolCount: number
  /** The skill or mode driving the work, when one was used */
  method: string | null
}

/** A plan being made, from brainstorming or plan mode until its work starts */
export type Planning = { method: string; startedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'context-bar': {
      context: ContextFill | null
      plan: Plan | null
      todos: TodoItem[]
      isHidden: boolean
      turn: Turn | null
      steps: Step[]
      now: number
      /** When the current task list began, for the time-left estimate */
      todosStartedAt: number | null
      isPaneClosed: boolean
      /** Whether this prompt has touched the plan file */
      isPlanTouched: boolean
      /** Set while a plan is being made: by which skill or mode, and since when */
      planning: Planning | null
      /** Set once a plan is being carried out (executing skill loaded or plan mode approved) */
      isExecuting: boolean
    }
  }
}
