export type ExtraStatus = 'off' | 'installing' | 'on' | 'error'
export type CompareRow = { item: string; basic: boolean; extra: boolean | null }

declare module 'claude-code' {
  interface PluginState {
    guard: {
      extra: ExtraStatus
      setupLog: string[]
      compare: CompareRow[]
    }
  }
}
