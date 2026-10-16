// Pure helpers: no `$`, no state. The hooks module and the tests both use them.
import type { Answer, Question, Upgrade } from '../types'

export const MAX_QUESTIONS = 2
export const MAX_OPTIONS = 4
export const HISTORY_LIMIT = 20
// A prompt this short is a quick question or reply: it goes straight through.
export const SIMPLE_WORDS = 5

// Replies that carry a conversation forward rather than ask for new work.
const SHORT_REPLIES = new Set([
  'y', 'n', 'yes', 'no', 'yep', 'nope', 'yeah', 'nah', 'ok', 'okay', 'k', 'sure',
  'thanks', 'thank you', 'ty', 'cool', 'nice', 'great', 'perfect', 'lgtm',
  'go', 'go on', 'go ahead', 'continue', 'keep going', 'carry on', 'proceed',
  'do it', 'ship it', 'sounds good', 'looks good', 'yes please', 'no thanks',
  'stop', 'wait', 'retry', 'try again', 'again', 'next', 'done', 'agreed',
])

export type PromptLike = {
  text: string
  command?: unknown
  isMeta?: true
  attachments?: readonly unknown[]
  turnId?: string
  origin: { kind: string }
}

export type Route =
  | { kind: 'pass' }
  | { kind: 'strip'; text: string }
  | { kind: 'upgrade'; text: string }

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

export function isShortReply(text: string): boolean {
  const cleaned = text.trim().toLowerCase().replace(/[.!?,]+$/g, '').trim()
  return SHORT_REPLIES.has(cleaned) || wordCount(cleaned) <= SIMPLE_WORDS
}

// Which prompts the automatic mode takes, and which go straight through.
export function route(e: PromptLike, isAuto: boolean): Route {
  if (!isAuto) return { kind: 'pass' }
  if (e.origin.kind !== 'composer') return { kind: 'pass' } // includes our own sends
  if (e.command !== undefined || e.isMeta) return { kind: 'pass' }
  if ((e.attachments?.length ?? 0) > 0) return { kind: 'pass' }
  if (e.turnId !== undefined) return { kind: 'pass' } // typed while Claude works
  const trimmed = e.text.trim()
  if (trimmed.startsWith('>')) return { kind: 'strip', text: trimmed.slice(1).trimStart() }
  if (trimmed === '' || trimmed.startsWith('/')) return { kind: 'pass' }
  if (isShortReply(trimmed)) return { kind: 'pass' }
  return { kind: 'upgrade', text: trimmed }
}

// The model's reply as JSON, tolerating code fences and chatter around it.
function extractJson(reply: string): unknown {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start === -1 || end <= start) return undefined
  try {
    return JSON.parse(reply.slice(start, end + 1))
  } catch {
    return undefined
  }
}

function cleanLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  const one = value.replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, max - 1).trimEnd() + '…' : one
}

// undefined: the reply could not be read. []: no question would help.
export function parseQuestions(reply: string): Question[] | undefined {
  const data = extractJson(reply) as { questions?: unknown } | undefined
  if (data === undefined || !Array.isArray(data.questions)) return undefined
  const out: Question[] = []
  for (const raw of data.questions) {
    if (out.length >= MAX_QUESTIONS) break
    const q = raw as { question?: unknown; text?: unknown; options?: unknown }
    const text = cleanLine(q.question ?? q.text, 140)
    if (text === '' || !Array.isArray(q.options)) continue
    const options = q.options
      .map(o => cleanLine(o, 40))
      .filter(o => o !== '' && !/^other\b/i.test(o) && !/^skip$/i.test(o))
      .slice(0, MAX_OPTIONS)
    if (options.length >= 2) out.push({ text, options })
  }
  return out
}

export function parseRewrite(reply: string): Upgrade | undefined {
  const data = extractJson(reply) as { prompt?: unknown; added?: unknown } | undefined
  if (data !== undefined && typeof data.prompt === 'string' && data.prompt.trim() !== '') {
    const added = Array.isArray(data.added)
      ? data.added.map(a => cleanLine(a, 80)).filter(a => a !== '').slice(0, 8)
      : []
    return { text: data.prompt.trim(), added }
  }
  // No JSON: take a plain-text reply as the prompt itself.
  const plain = reply.replace(/^```[a-z]*\n?|```$/gm, '').trim()
  if (plain === '' || plain.startsWith('{')) return undefined
  return { text: plain, added: [] }
}

export const QUESTIONS_SYSTEM = `You help a person sharpen a prompt before they send it to an AI assistant, in the middle of a chat with it.
Default to no questions. Ask at most ${MAX_QUESTIONS}, and only about something that would really change the result AND that neither the prompt nor the recent chat already answers.
Read the recent chat first: the person's goal, project and preferences there count as known. Build the options from that chat, so they are specific to this work, not generic.
A simple, conversational or follow-up request needs no questions.
Each question is short and plain. Each has 2 to ${MAX_OPTIONS} options of at most 6 words. Do not add "Other" or "Skip" options.
Reply with JSON only, no prose: {"questions":[{"question":"...","options":["...","..."]}]}`

export function questionsPrompt(original: string, context: string): string {
  return `${contextBlock(context)}The prompt:\n"""\n${original}\n"""`
}

function contextBlock(context: string): string {
  return context === '' ? '' : `The recent chat, oldest first:\n"""\n${context}\n"""\n\n`
}

export type ChatLine = { role: string; text: string }

// The last few turns of the chat, trimmed so the call stays small and cheap.
export function chatContext(messages: readonly ChatLine[], limit = 4_000): string {
  const out: string[] = []
  let used = 0
  for (let i = messages.length - 1; i >= 0 && out.length < 8; i--) {
    const m = messages[i]!
    const text = m.text.replace(/\s+/g, ' ').trim()
    if (text === '') continue
    const line = `${m.role === 'user' ? 'Person' : 'Assistant'}: ${clip(text, 600)}`
    if (used + line.length > limit) break
    out.unshift(line)
    used += line.length
  }
  return out.join('\n')
}

export const REWRITE_SYSTEM = `You rewrite a rough prompt into a clear one the person could have typed themselves.
Rules:
- Keep exactly what they meant. Do not change the task.
- Add a clear goal, who it is for, the format of the answer, and what "done" looks like.
- Use the answers given and what the recent chat already settled. Leave out anything they skipped.
- Never invent facts, names, numbers or prices. Where something is unknown, write a [placeholder] in square brackets.
- One request in plain language, first person, no headings, no preamble.
Also list what you added, each item at most 8 words.
Reply with JSON only, no prose: {"prompt":"...","added":["...","..."]}`

export function rewritePrompt(
  original: string,
  questions: Question[],
  answers: (Answer | null)[],
  context = '',
): string {
  const lines: string[] = []
  questions.forEach((q, i) => {
    const a = answers[i]
    if (a === undefined || a === null || a.kind === 'skip') return
    lines.push(`- ${q.text}\n  Answer: ${a.value}`)
  })
  const answered = lines.length > 0 ? lines.join('\n') : 'No questions were answered.'
  return `${contextBlock(context)}The rough prompt:\n"""\n${original}\n"""\n\nTheir answers:\n${answered}`
}

// Text sizing: everything is fitted to the pane's columns so no row wraps.
export function clip(text: string, width: number): string {
  if (width <= 0) return ''
  if (text.length <= width) return text
  return width === 1 ? '…' : text.slice(0, width - 1) + '…'
}

export function pad(text: string, width: number): string {
  const cut = clip(text, width)
  return cut + ' '.repeat(Math.max(0, width - cut.length))
}

export function wrap(text: string, width: number): string[] {
  const w = Math.max(1, width)
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let rest = word
      while (rest.length > w) {
        if (line !== '') {
          out.push(line)
          line = ''
        }
        out.push(rest.slice(0, w))
        rest = rest.slice(w)
      }
      if (line === '') line = rest
      else if (line.length + 1 + rest.length <= w) line += ' ' + rest
      else {
        out.push(line)
        line = rest
      }
    }
    out.push(line)
  }
  while (out.length > 1 && out[out.length - 1] === '') out.pop()
  return out
}

// Three-row digits in heavy box-drawing characters, each 3 cells wide.
const DIGITS: Record<string, [string, string, string]> = {
  '0': ['┏━┓', '┃ ┃', '┗━┛'],
  '1': ['╺┓ ', ' ┃ ', '╺┻╸'],
  '2': ['╺━┓', '┏━┛', '┗━╸'],
  '3': ['╺━┓', ' ━┫', '╺━┛'],
  '4': ['╻ ╻', '┗━┫', '  ╹'],
  '5': ['┏━╸', '┗━┓', '╺━┛'],
  '6': ['┏━╸', '┣━┓', '┗━┛'],
  '7': ['╺━┓', '  ┃', '  ╹'],
  '8': ['┏━┓', '┣━┫', '┗━┛'],
  '9': ['┏━┓', '┗━┫', '╺━┛'],
}

export function bigNumber(n: number): [string, string, string] {
  const chars = String(Math.max(0, Math.round(n))).split('')
  const rows: [string, string, string] = ['', '', '']
  for (let r = 0; r < 3; r++) {
    rows[r] = chars.map(c => DIGITS[c]?.[r] ?? '   ').join(' ')
  }
  return rows
}

export function bigNumberWidth(n: number): number {
  return String(Math.max(0, Math.round(n))).length * 4 - 1
}
