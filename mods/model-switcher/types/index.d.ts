export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type Chip = { value: string; isAvailable: boolean }

export type Preset = { name: string; model: string; effort: Effort }

declare module 'claude-code' {
  interface PluginState {
    'model-switcher': {
      // The models Claude Code's /config Model row offers right now.
      offered: string[]
      // What that row holds: an alias such as "opus", a full id, or "default".
      current: string
      // The id the session resolves it to, e.g. "claude-opus-5-5[1m]".
      resolved: string
      // The effort pick; null leaves the model's own default.
      effort: Effort | null
      // The effort the engine would send unasked, seen on the last main step;
      // null for a model that takes no effort.
      baseEffort: Effort | null
      // Messages the last main request carried: a switch past a few re-sends them all.
      messages: number
      // Whether the band holds the keyboard (ctrl+x tab), so hotkey hints show.
      isKeyboard: boolean
    }
  }
}
