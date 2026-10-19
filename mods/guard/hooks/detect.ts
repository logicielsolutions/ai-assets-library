export type Finding = { label: string; start: number; end: number; value: string }

type Rule = { label: string; re: RegExp; group?: number }

// Known formats: very reliable, so no further checks.
const FORMAT_RULES: Rule[] = [
  { label: 'private-key', re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g },
  { label: 'aws-access-key', re: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA)[0-9A-Z]{16}\b/g },
  { label: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/g },
  { label: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { label: 'stripe-key', re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { label: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { label: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g },
  { label: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { label: 'url-password', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:([^\s@/]{3,})@[^\s]+/gi, group: 1 },
  { label: 'bearer-token', re: /\bBearer\s+([A-Za-z0-9._~+/-]{20,}=*)/g, group: 1 },
  { label: 'aws-secret-key', re: /\b(?:aws_?secret_?access_?key|secret_?access_?key)\b\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})\b/gi, group: 1 },
]

// `name = value` where the name says secret; the value must also look secret.
const ASSIGNMENT =
  /\b([A-Za-z0-9_.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret)[A-Za-z0-9_.-]*)\s*[:=]\s*["']?([^\s"',;]{8,})["']?/gi

const PLACEHOLDER =
  /^(?:\$\{.*\}|\$[A-Z_]+|<.*>|\{\{.*\}\}|%.*%|process\.env.*|os\.environ.*|your[_-].*|x{4,}|\*{4,}|changeme|change[_-]me|example.*|placeholder.*|null|none|undefined|true|false|\[REDACTED.*)$/i


// "my api key is 697979kl", "password is hunter2": no format, so go by the words.
const SPOKEN =
  /\b(password|passwd|pwd|passcode|pass\s?phrase|secret|token|api[ _-]?key|apikey|access[ _-]?key|private[ _-]?key|auth(?:orization)?[ _-]?(?:key|token)|pin|otp)\b\s*(?:is|was|are|=|:|->)\s*["'`]?([^\s"'`,;]{4,})["'`]?/gi

/** A plain lowercase word ("expired", "required") is not a credential; digits, case or symbols make it one. Digits alone count from 6 (4 for a pin or otp). */
export const looksSpoken = (keyword: string, raw: string): boolean => {
  const value = raw.replace(/[.!?)\]]+$/, '')
  const word = keyword.toLowerCase()
  if (value.length < 4 || PLACEHOLDER.test(value)) return false
  if (/^[0-9]+$/.test(value)) return value.length >= (word === 'pin' || word === 'otp' ? 4 : 6)
  if (value.length < 6) return false
  if (/^[a-z]+$/.test(value)) return false
  return /[0-9]/.test(value) || /[^A-Za-z0-9]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value))
}

export const entropy = (s: string): number => {
  const counts = new Map<string, number>()
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  let h = 0
  for (const n of counts.values()) h -= (n / s.length) * Math.log2(n / s.length)
  return h
}

export const looksSecret = (value: string): boolean => {
  if (PLACEHOLDER.test(value)) return false
  if (/^[0-9.]+$/.test(value)) return false
  return value.length >= 16 ? entropy(value) >= 3 : entropy(value) >= 3.3 && /[A-Za-z]/.test(value) && /[0-9]/.test(value)
}

const locate = (text: string, start: number, value: string, whole: string, label: string): Finding => {
  const offset = whole.indexOf(value)
  const s = start + (offset < 0 ? 0 : offset)
  return { label, start: s, end: s + value.length, value }
}

/** Drops findings that sit inside a longer one. */
export const settle = (found: Finding[]): Finding[] => {
  const sorted = [...found].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
  const out: Finding[] = []
  for (const f of sorted) {
    const last = out[out.length - 1]
    if (!last || f.start >= last.end) out.push(f)
  }
  return out
}

/** `known`: exact secret values learned from .env files. `allowed`: values marked as false positives. */
export const findSecrets = (text: string, known: readonly string[] = [], allowed: ReadonlySet<string> = new Set()): Finding[] => {
  const found: Finding[] = []

  for (const rule of FORMAT_RULES) {
    for (const m of text.matchAll(rule.re)) {
      const whole = m[0]
      const value = rule.group !== undefined ? (m[group(rule)] ?? '') : whole
      if (value === '') continue
      found.push(rule.group !== undefined ? locate(text, m.index ?? 0, value, whole, rule.label) : { label: rule.label, start: m.index ?? 0, end: (m.index ?? 0) + whole.length, value: whole })
    }
  }

  for (const m of text.matchAll(ASSIGNMENT)) {
    const value = m[2] ?? ''
    if (looksSecret(value)) found.push(locate(text, m.index ?? 0, value, m[0], 'credential'))
  }

  for (const m of text.matchAll(SPOKEN)) {
    const value = (m[2] ?? '').replace(/[.!?)\]]+$/, '')
    if (looksSpoken(m[1] ?? '', value)) found.push(locate(text, m.index ?? 0, value, m[0], 'credential'))
  }

  for (const value of known) {
    let from = text.indexOf(value)
    while (from >= 0) {
      found.push({ label: 'env-secret', start: from, end: from + value.length, value })
      from = text.indexOf(value, from + value.length)
    }
  }

  return settle(found).filter(f => !allowed.has(f.value))
}

const group = (rule: Rule): number => rule.group ?? 0

export type Registry = { tags: Map<string, string>; counts: Map<string, number> }

export const newRegistry = (): Registry => ({ tags: new Map(), counts: new Map() })

const tagFor = (reg: Registry, f: Finding): string => {
  const have = reg.tags.get(f.value)
  if (have) return have
  const n = (reg.counts.get(f.label) ?? 0) + 1
  reg.counts.set(f.label, n)
  const tag = `[REDACTED:${f.label} #${n}]`
  reg.tags.set(f.value, tag)
  return tag
}

/** The same secret always gets the same tag, so the model can still refer to it. */
export const redact = (text: string, findings: readonly Finding[], reg: Registry): string => {
  let out = text
  for (const f of [...findings].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, f.start) + tagFor(reg, f) + out.slice(f.end)
  }
  return out
}

/** A hint of the value that cannot be used to rebuild it. */
export const mask = (value: string): string => (value.length <= 8 ? '…' : `${value.slice(0, 3)}…(${value.length} chars)`)

export const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length

const SECRET_KEY = /(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|credential|auth)/i

/** Values worth learning from a .env file. */
export const parseEnv = (text: string): string[] => {
  const values: string[] = []
  for (const line of text.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    const value = (m[2] ?? '').trim().replace(/^["']|["']$/g, '')
    if (value.length < 8 || PLACEHOLDER.test(value) || /^[0-9.]+$/.test(value)) continue
    if (SECRET_KEY.test(m[1] ?? '') || (value.length >= 16 && entropy(value) >= 3.5)) values.push(value)
  }
  return [...new Set(values)]
}

export const isEnvFile = (name: string): boolean =>
  /^\.env(\..+)?$/.test(name) && !/\.(example|sample|template|dist)$/.test(name)

/** Files where secrets belong; writes there are not flagged. */
export const isSecretHome = (path: string): boolean => /(^|\/)\.env(\..*)?$/.test(path)

// What to do with a secret in the user's prompt. `ask` mode puts the choice
// to the user; the labels are the dialog's options, safest first.
export type PromptAction = 'redact' | 'send' | 'edit'

export const PROMPT_CHOICES = {
  redact: 'Redact and send',
  send: 'Send as typed',
  edit: "Don't send, let me edit",
} as const satisfies Record<PromptAction, string>

export const promptQuestion = (found: readonly Finding[]): string => {
  const shown = found.slice(0, 3).map(f => `${f.label} ${mask(f.value)}`).join(', ')
  const more = found.length > 3 ? ` and ${found.length - 3} more` : ''
  return `Your prompt has a possible secret (${shown}${more}). Redact it before sending?`
}

// The dialog's answer as an action. Anything that is not one of the labels
// (text typed under "Other") counts as the safe choice.
export const actionFor = (answer: string): PromptAction =>
  answer === PROMPT_CHOICES.send ? 'send' : answer === PROMPT_CHOICES.edit ? 'edit' : 'redact'
