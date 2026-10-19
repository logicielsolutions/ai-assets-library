import type { Chip, Effort, Preset } from '../types'

export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export const EFFORT_LABEL: Record<Effort, string> = {
  low: 'low',
  medium: 'med',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
}

export const EFFORT_NAME: Record<Effort, string> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'extra high',
  max: 'max',
}

// A switch this deep into a conversation re-sends it all without the cache.
export const CACHE_HINT_MESSAGES = 20

const list = (text: string) =>
  text
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)

/**
 * The chips to draw: the configured models in order ("all" for every one
 * Claude Code offers), each marked by whether Claude Code offers it now, and
 * the current model added at the end when the list leaves it out.
 */
export function chips(configured: string, offered: readonly string[], current: string): Chip[] {
  const wanted = configured.trim().toLowerCase() === 'all' ? offered.filter(m => m !== 'default') : list(configured)
  const values = wanted.includes(current) || current === '' ? wanted : [...wanted, current]

  return [...new Set(values)].map(value => ({ value, isAvailable: offered.includes(value) }))
}

/** "Quick=haiku/low, Deep=opus/max" → presets; a malformed pair is skipped. */
export function presets(text: string): Preset[] {
  return list(text).flatMap(pair => {
    const match = /^([^=]+)=([^/]+)\/(\w+)$/.exec(pair)
    if (!match) return []
    const effort = match[3]!.trim() as Effort
    if (!EFFORTS.includes(effort)) return []

    return [{ name: match[1]!.trim(), model: match[2]!.trim(), effort }]
  })
}

/** "claude-opus-5-5[1m]" → "Opus 5.5 · 1M"; anything unrecognised is returned as is. */
export function pretty(id: string): string {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(\[1m\])?$/i.exec(id)
  if (!match) return id
  const [, family, major, minor, wide] = match
  const name = family!.charAt(0).toUpperCase() + family!.slice(1)
  const version = minor === undefined ? major : `${major}.${minor}`

  return `${name} ${version}${wide ? ' · 1M' : ''}`
}

export function effortText(effort: Effort | null, baseEffort: Effort | null): string {
  if (effort !== null) return EFFORT_LABEL[effort]

  return baseEffort === null ? 'auto' : `auto (${EFFORT_LABEL[baseEffort]})`
}

export function statusLine(resolved: string, effort: Effort | null, baseEffort: Effort | null): string {
  return `${pretty(resolved)} · ${effortText(effort, baseEffort)}`
}

/** The item after `current` in `items`, wrapping; the first when `current` is not there. */
export function cycle<T>(items: readonly T[], current: T): T {
  const at = items.indexOf(current)

  return items[(at + 1) % items.length]!
}

export function isEffort(value: unknown): value is Effort {
  return typeof value === 'string' && (EFFORTS as readonly string[]).includes(value)
}

// Theme keys, so the colours follow the person's light or dark theme.
const FAMILY_COLOR: [string, string][] = [
  ['haiku', 'success'],
  ['sonnet', 'suggestion'],
  ['opus', 'autoAccept'],
  ['fable', 'claude'],
]

/** The colour of a model chip, by the family its alias or id names. */
export function familyColor(model: string): string {
  return FAMILY_COLOR.find(([family]) => model.includes(family))?.[1] ?? 'permission'
}

export const EFFORT_COLOR: Record<Effort, string> = {
  low: 'success',
  medium: 'suggestion',
  high: 'autoAccept',
  xhigh: 'warning',
  max: 'error',
}

export const PRESET_ICONS = ['↯', '✎', '✦', '◈', '❖']

/** How many of the meter's five bars a level fills: low 1 … max 5. */
export function bars(level: Effort | null): number {
  return level === null ? 0 : EFFORTS.indexOf(level) + 1
}
