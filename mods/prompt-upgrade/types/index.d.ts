export type Question = { text: string; options: string[] }

export type Answer = { kind: 'option' | 'other'; value: string } | { kind: 'skip' }

export type Upgrade = { text: string; added: string[] }

export type Step =
  | 'compose'
  | 'reading'
  | 'questions'
  | 'rewriting'
  | 'review'
  | 'error'
  | 'history'

export type FlowError = { stage: 'questions' | 'rewrite'; reason: string }

export type Flow = {
  id: string
  runId: string
  step: Step
  original: string
  questions: Question[]
  answers: (Answer | null)[]
  otherFor: number | null
  upgrade: Upgrade | null
  isEditing: boolean
  draft: string
  isCopied: boolean
  error: FlowError | null
}

export type HistoryEntry = {
  id: string
  at: number
  original: string
  questions: Question[]
  answers: (Answer | null)[]
  upgrade: Upgrade
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-upgrade': {
      auto: boolean
      flow: Flow | null
      history: HistoryEntry[]
    }
  }
}
