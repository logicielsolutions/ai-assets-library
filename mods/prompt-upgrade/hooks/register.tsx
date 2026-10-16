import { atom, read, update } from 'claude-code'
import type {
  BoxProps,
  ButtonProps,
  ElementConstructor,
  EngineInterface,
  InputProps,
  ModelCompleteResult,
  Register,
  RenderElement,
  RenderSurface,
  TextProps,
} from 'claude-code'

import type { Answer, Flow, HistoryEntry, Question, Step, Upgrade } from '../types'
import {
  HISTORY_LIMIT,
  QUESTIONS_SYSTEM,
  REWRITE_SYSTEM,
  bigNumber,
  bigNumberWidth,
  chatContext,
  clip,
  pad,
  parseQuestions,
  parseRewrite,
  questionsPrompt,
  rewritePrompt,
  route,
  wordCount,
  wrap,
} from './logic'

type $ = EngineInterface

const PANE = 'prompt-upgrade'
const TITLE = 'PROMPT UPGRADE'
const MODEL = 'haiku'
const NARROW =
  'Prompt Upgrade needs a wider window to open, so your prompt is back in the box.'
const WORKING = 'Prompt Upgrade is working on it.'
const KEPT = 'Kept your prompt in the box. Start it with > to send it without being asked.'
const ASK = 'Upgrade this prompt before sending it?'
const SEND_AS_TYPED = 'No, send as typed'
const UPGRADE_IT = 'Yes, upgrade it'
const ORIGINAL = 'Send my original'

const GOLD = '#F2C46D'
const LINE = '#262B33'
const MUTED = '#7D8590'
const TEXT = '#E6EDF3'
const GREEN = '#3DD68C'
const AMBER = '#E3B341'
const DARK = '#0D1117'

const autoAtom = atom({ plugin: 'prompt-upgrade', key: 'auto' } as const, true)
const flowAtom = atom({ plugin: 'prompt-upgrade', key: 'flow' } as const, null)
const historyAtom = atom({ plugin: 'prompt-upgrade', key: 'history' } as const, [])

// ---------------------------------------------------------------- state changes

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function freshFlow(original: string, step: Step): Flow {
  return {
    id: newId(),
    runId: newId(),
    step,
    original,
    questions: [],
    answers: [],
    otherFor: null,
    upgrade: null,
    isEditing: false,
    draft: '',
    isCopied: false,
    error: null,
  }
}

function later($: $, work: () => Promise<unknown>): void {
  $.clock.after(0, () => {
    work().catch(() => undefined)
  })
}

function describeFailure(r: ModelCompleteResult): string {
  if (r.isAnswered) return ''
  if (r.reason === 'api-error') {
    return `The model call failed (${r.error}${r.status === null ? '' : `, ${r.status}`}).`
  }
  if (r.reason === 'empty-reply') return 'The model sent back an empty reply.'
  return 'The model took too long to answer.'
}

async function openPane($: $): Promise<boolean> {
  const opened = await $.ui.open({ id: PANE, title: 'Prompt Upgrade', focus: true, columns: 100 })
  return opened.isPlaced
}

// Shows `flow` in the pane. When the window is too narrow, closes it again and
// hands back false; the caller decides how to tell the person.
async function showFlow($: $, flow: Flow): Promise<boolean> {
  await update($, flowAtom, () => flow)
  if (await openPane($)) return true
  await update($, flowAtom, () => null)
  await $.ui.close({ id: PANE })
  return false
}

async function startUpgrade($: $, original: string): Promise<boolean> {
  const flow = freshFlow(original, 'reading')
  const isPlaced = await showFlow($, flow)
  if (isPlaced) later($, () => runQuestions($, flow.runId))
  return isPlaced
}

async function failStage($: $, runId: string, stage: 'questions' | 'rewrite', reason: string) {
  await update($, flowAtom, cur =>
    cur !== null && cur.runId === runId ? { ...cur, step: 'error' as const, error: { stage, reason } } : cur,
  )
}

// The chat so far, so questions and the rewrite build on what was already said.
async function recentChat($: $): Promise<string> {
  try {
    return chatContext(await $.session.messages())
  } catch {
    return ''
  }
}

async function runQuestions($: $, runId: string): Promise<void> {
  const flow = await read($, flowAtom)
  if (flow === null || flow.runId !== runId || flow.step !== 'reading') return
  const reply = await $.model.complete({
    model: MODEL,
    system: QUESTIONS_SYSTEM,
    prompt: questionsPrompt(flow.original, await recentChat($)),
    maxTokens: 700,
    effort: 'low',
    timeoutMs: 30_000,
  })
  if (!reply.isAnswered) return failStage($, runId, 'questions', describeFailure(reply))
  const questions = parseQuestions(reply.text)
  if (questions === undefined) {
    return failStage($, runId, 'questions', 'The model replied in a shape I could not read.')
  }
  let goStraightOn = false
  await update($, flowAtom, cur => {
    if (cur === null || cur.runId !== runId || cur.step !== 'reading') return cur
    goStraightOn = questions.length === 0
    return {
      ...cur,
      step: (goStraightOn ? 'rewriting' : 'questions') as Step,
      questions,
      answers: questions.map(() => null),
    }
  })
  if (goStraightOn) await runRewrite($, runId)
}

async function runRewrite($: $, runId: string): Promise<void> {
  const flow = await read($, flowAtom)
  if (flow === null || flow.runId !== runId || flow.step !== 'rewriting') return
  const reply = await $.model.complete({
    model: MODEL,
    system: REWRITE_SYSTEM,
    prompt: rewritePrompt(flow.original, flow.questions, flow.answers, await recentChat($)),
    maxTokens: 2_000,
    effort: 'low',
    timeoutMs: 60_000,
  })
  if (!reply.isAnswered) return failStage($, runId, 'rewrite', describeFailure(reply))
  const upgrade = parseRewrite(reply.text)
  if (upgrade === undefined) {
    return failStage($, runId, 'rewrite', 'The model replied in a shape I could not read.')
  }
  let done: Flow | null = null
  await update($, flowAtom, cur => {
    if (cur === null || cur.runId !== runId || cur.step !== 'rewriting') return cur
    done = { ...cur, step: 'review' as const, upgrade, draft: upgrade.text, error: null }
    return done
  })
  if (done !== null) await remember($, done)
}

async function remember($: $, flow: Flow): Promise<void> {
  if (flow.upgrade === null) return
  const entry: HistoryEntry = {
    id: flow.id,
    at: await $.clock.now(),
    original: flow.original,
    questions: flow.questions,
    answers: flow.answers,
    upgrade: flow.upgrade,
  }
  const list = await update($, historyAtom, list =>
    [entry, ...list.filter(one => one.id !== entry.id)].slice(0, HISTORY_LIMIT),
  )
  await $.store.set('history', list)
}

async function goRewrite($: $): Promise<void> {
  const runId = newId()
  await update($, flowAtom, cur =>
    cur === null ? cur : { ...cur, step: 'rewriting' as const, runId, otherFor: null, error: null },
  )
  await runRewrite($, runId)
}

async function answer($: $, index: number, value: Answer): Promise<void> {
  let isComplete = false
  await update($, flowAtom, cur => {
    if (cur === null || cur.step !== 'questions') return cur
    const answers = cur.answers.map((a, i) => (i === index ? value : a))
    isComplete = answers.every(a => a !== null)
    return { ...cur, answers, otherFor: null }
  })
  if (isComplete) await goRewrite($)
}

async function closeFlow($: $): Promise<Flow | null> {
  const flow = await read($, flowAtom)
  await update($, flowAtom, () => null)
  await $.ui.close({ id: PANE })
  return flow
}

// The box can still hold the prompt the mod took. Empty it, but only while it
// holds exactly that: anything typed since is left alone.
async function clearDraft($: $, original: string): Promise<void> {
  if (original.trim() === '') return
  const box = await $.prompt.read()
  if (box.text.trim() === original.trim()) await $.prompt.fill({ text: '' })
}

async function runIt($: $, text: string): Promise<void> {
  const flow = await closeFlow($)
  if (flow !== null) await clearDraft($, flow.original)
  const body = text.trim()
  if (body === '') return
  if (flow?.upgrade && body !== flow.upgrade.text) {
    await remember($, { ...flow, upgrade: { ...flow.upgrade, text: body } })
  }
  // Sent as a plugin: its origin is `plugin`, which `route` always passes.
  await $.prompt.submit({ text: body, asUser: true })
}

async function cancel($: $): Promise<void> {
  const flow = await closeFlow($)
  if (flow !== null && flow.original !== '') await $.prompt.fill({ text: flow.original })
}

async function sendOriginal($: $): Promise<void> {
  const flow = await closeFlow($)
  if (flow !== null && flow.original !== '') {
    await clearDraft($, flow.original)
    await $.prompt.submit({ text: flow.original, asUser: true })
  }
}

async function retry($: $): Promise<void> {
  const flow = await read($, flowAtom)
  if (flow === null || flow.error === null) return
  const runId = newId()
  const step: Step = flow.error.stage === 'questions' ? 'reading' : 'rewriting'
  await update($, flowAtom, cur => (cur === null ? cur : { ...cur, step, runId, error: null }))
  if (step === 'reading') await runQuestions($, runId)
  else await runRewrite($, runId)
}

async function copyUpgrade($: $, surface: RenderSurface): Promise<void> {
  const flow = await read($, flowAtom)
  if (flow === null || flow.upgrade === null) return
  const text = flow.isEditing ? flow.draft : flow.upgrade.text
  const copied = await $.ui.copy({ text, surface })
  await update($, flowAtom, cur => (cur === null ? cur : { ...cur, isCopied: copied.isCopied }))
}

async function setAuto($: $, isOn: boolean): Promise<void> {
  await update($, autoAtom, () => isOn)
  await $.store.set('auto', isOn)
}

// ---------------------------------------------------------------- drawing

type Els = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Input?: ElementConstructor<InputProps>
}

type Chip = {
  key: string
  label: string
  tone: 'gold' | 'slate' | 'quiet'
  onPress: () => void
  hotkey?: string
}

function chipRows(els: Els, chips: Chip[], width: number, rowKey: string): RenderElement[] {
  const { Box, Text, Button } = els
  const rows: Chip[][] = [[]]
  let used = 0
  for (const chip of chips) {
    const size = Math.min(chip.label.length + 2 + (chip.hotkey ? 3 : 0), width)
    const row = rows[rows.length - 1]!
    if (row.length > 0 && used + 1 + size > width) {
      rows.push([chip])
      used = size
    } else {
      used += (row.length > 0 ? 1 : 0) + size
      row.push(chip)
    }
  }
  return rows.map((row, r) => (
    <Box key={`${rowKey}-${r}`} flexDirection="row" gap={1}>
      {row.map(chip => {
        const label = ` ${clip(chip.label, width - 2 - (chip.hotkey ? 3 : 0))} `
        return (
          <Button key={chip.key} plain hotkey={chip.hotkey} onPress={chip.onPress}>
            {chip.tone === 'gold' ? (
              <Text backgroundColor={GOLD} color={DARK} bold>
                {label}
              </Text>
            ) : chip.tone === 'slate' ? (
              <Text backgroundColor={LINE} color={TEXT}>
                {label}
              </Text>
            ) : (
              <Text color={MUTED}>{label}</Text>
            )}
          </Button>
        )
      })}
    </Box>
  ))
}

function header(els: Els, width: number, right: string): RenderElement {
  const { Box, Text } = els
  const title = clip(TITLE, width)
  const room = width - title.length
  const side = room > right.length + 1 ? right.padStart(room) : ' '.repeat(Math.max(0, room))
  return (
    <Box flexDirection="column" width={width}>
      <Box flexDirection="row">
        <Text bold color={TEXT}>
          {title}
        </Text>
        <Text color={MUTED}>{side}</Text>
      </Box>
      <Box flexDirection="row">
        <Text color={GOLD}>{'━'.repeat(title.length)}</Text>
        <Text color={LINE}>{'─'.repeat(Math.max(0, width - title.length))}</Text>
      </Box>
    </Box>
  )
}

function heading(els: Els, width: number, label: string, hint = ''): RenderElement {
  const { Box, Text } = els
  const name = clip(label, width)
  const hintText = hint !== '' && width - name.length - hint.length - 4 >= 3 ? ` ${hint}` : ''
  const rule = Math.max(0, width - name.length - 1 - hintText.length)
  return (
    <Box flexDirection="row" marginTop={1}>
      <Text color={MUTED}>{name}</Text>
      <Text color={LINE}>{rule > 0 ? ' ' + '─'.repeat(rule) : ''}</Text>
      <Text color={MUTED}>{hintText}</Text>
    </Box>
  )
}

const STEPS = ['Your prompt', 'Questions', 'Rewrite', 'Review'] as const

function stepIndex(flow: Flow): number {
  switch (flow.step) {
    case 'reading':
      return 0
    case 'questions':
      return 1
    case 'rewriting':
      return 2
    case 'error':
      return flow.error?.stage === 'rewrite' ? 2 : 1
    default:
      return 3
  }
}

function tracker(els: Els, width: number, current: number): RenderElement {
  const { Box, Text } = els
  const marks = STEPS.map((label, i) => ({
    text: `${i < current ? '✓' : i === current ? '●' : '○'} ${label}`,
    color: i < current ? GREEN : i === current ? GOLD : MUTED,
    isBold: i === current,
  }))
  const total = (joint: number) => marks.reduce((n, m) => n + m.text.length, 0) + joint * 3
  const joint = total(4) <= width ? 4 : total(2) <= width ? 2 : -1
  if (joint === -1) {
    const one = marks[current]!
    return (
      <Box marginTop={1}>
        <Text color={one.color} bold>
          {clip(`Step ${current + 1} of 4  ${one.text}`, width)}
        </Text>
      </Box>
    )
  }
  const glue = joint === 4 ? ' ── ' : '  '
  return (
    <Box flexDirection="row" marginTop={1}>
      {marks.map((m, i) => (
        <Box key={`step-${i}`} flexDirection="row">
          <Text color={m.color} bold={m.isBold}>
            {m.text}
          </Text>
          {i < marks.length - 1 && <Text color={i < current ? GREEN : LINE}>{glue}</Text>}
        </Box>
      ))}
    </Box>
  )
}

function card(
  els: Els,
  width: number,
  label: string,
  body: string,
  tone: 'plain' | 'gold' | 'amber' = 'plain',
  key = label,
): RenderElement {
  const { Box, Text } = els
  const inner = Math.max(1, width - 4)
  const border = tone === 'gold' ? GOLD : tone === 'amber' ? AMBER : LINE
  const labelColor = tone === 'gold' ? GOLD : tone === 'amber' ? AMBER : MUTED
  return (
    <Box
      key={key}
      flexDirection="column"
      borderStyle="round"
      borderColor={border}
      paddingX={1}
      width={width}
    >
      <Text color={labelColor} bold={tone !== 'plain'}>
        {clip(label, inner)}
      </Text>
      {wrap(body, inner).map((line, i) => (
        <Text key={`${key}-l${i}`} color={TEXT}>
          {line}
        </Text>
      ))}
    </Box>
  )
}

function tile(els: Els, width: number, value: number, caption: string, color: string): RenderElement {
  const { Box, Text } = els
  const inner = Math.max(1, width - 4)
  return (
    <Box key={caption} flexDirection="column" borderStyle="round" borderColor={LINE} paddingX={1} width={width}>
      {bigNumber(value).map((row, i) => (
        <Text key={`${caption}-${i}`} color={color} bold>
          {pad(row, inner)}
        </Text>
      ))}
      <Text color={MUTED}>{pad(caption, inner)}</Text>
    </Box>
  )
}

function stats(els: Els, width: number, before: number, after: number, added: number): RenderElement {
  const { Box, Text } = els
  const tileW = Math.floor((width - 2) / 3)
  const needed = Math.max(13, bigNumberWidth(Math.max(before, after, added))) + 4
  if (tileW < needed) {
    return (
      <Box marginTop={1}>
        <Text color={TEXT}>
          {clip(`${before} words before · ${after} words after · ${added} details added`, width)}
        </Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="row" gap={1} marginTop={1}>
      {tile(els, tileW, before, 'WORDS BEFORE', TEXT)}
      {tile(els, tileW, after, 'WORDS AFTER', GREEN)}
      {tile(els, tileW, added, 'DETAILS ADDED', GREEN)}
    </Box>
  )
}

type Ctx = { els: Els; width: number; surface: RenderSurface }

function drawWaiting($: $, ctx: Ctx, flow: Flow, line: string): RenderElement[] {
  const { els, width } = ctx
  const { Box, Text } = els
  return [
    <Box key="wait-card" marginTop={1}>
      {card(els, width, 'YOUR PROMPT', flow.original)}
    </Box>,
    <Box key="wait-line" marginTop={1}>
      <Text color={MUTED}>{clip(line, width)}</Text>
    </Box>,
    <Box key="wait-actions" marginTop={1} flexDirection="column">
      {chipRows(
        els,
        [
          { key: 'send-original', label: ORIGINAL, tone: 'slate', onPress: () => void sendOriginal($) },
          { key: 'cancel', label: 'Cancel', tone: 'quiet', onPress: () => void cancel($) },
        ],
        width,
        'wa',
      )}
    </Box>,
  ]
}

function drawQuestions($: $, ctx: Ctx, flow: Flow): RenderElement[] {
  const { els, width } = ctx
  const { Box, Text, Input } = els
  const total = flow.questions.length
  const open = flow.answers.findIndex(a => a === null)
  const i = open === -1 ? total - 1 : open
  const q: Question | undefined = flow.questions[i]
  const isTyping = flow.otherFor === i && Input !== undefined
  const out: RenderElement[] = [
    <Box key="q-prompt" marginTop={1} flexDirection="row">
      <Text color={MUTED}>{'Your prompt  '}</Text>
      <Text color={TEXT}>{clip(flow.original.replace(/\s+/g, ' '), Math.max(1, width - 13))}</Text>
    </Box>,
  ]
  // What is already answered, one quiet line each.
  flow.questions.forEach((done, d) => {
    const a = flow.answers[d] ?? null
    if (a === null || d === i) return
    const said = a.kind === 'skip' ? 'skipped' : a.value
    out.push(
      <Box key={`q-done-${d}`} flexDirection="row">
        <Text color={GREEN}>{'✓ '}</Text>
        <Text color={MUTED}>{clip(`${done.text}  ${said}`, Math.max(1, width - 2))}</Text>
      </Box>,
    )
  })
  if (q === undefined) return out
  out.push(heading(els, width, `QUESTION ${i + 1} OF ${total}`, isTyping ? '' : 'press a number'))
  wrap(q.text, width).forEach((line, l) =>
    out.push(
      <Box key={`q-text-${l}`} marginTop={l === 0 ? 1 : 0}>
        <Text color={TEXT} bold>
          {line}
        </Text>
      </Box>,
    ),
  )
  // One option per row: easier to scan than a wrapped strip of chips.
  const a = flow.answers[i] ?? null
  const options: Chip[] = q.options.map((option, o) => ({
    key: `q${i}-o${o}`,
    label: option,
    tone: a?.kind === 'option' && a.value === option ? 'gold' : 'slate',
    hotkey: isTyping ? undefined : String(o + 1),
    onPress: () => void answer($, i, { kind: 'option', value: option }),
  }))
  if (Input !== undefined) {
    options.push({
      key: `q${i}-other`,
      label: 'Other (type it)',
      tone: 'slate',
      hotkey: isTyping ? undefined : 'o',
      onPress: () => void update($, flowAtom, cur => (cur === null ? cur : { ...cur, otherFor: i })),
    })
  }
  options.push({
    key: `q${i}-skip`,
    label: 'Skip this one',
    tone: 'quiet',
    hotkey: isTyping ? undefined : 's',
    onPress: () => void answer($, i, { kind: 'skip' }),
  })
  out.push(
    <Box key={`q${i}-options`} flexDirection="column" marginTop={1}>
      {options.flatMap(chip => chipRows(els, [chip], width, chip.key))}
    </Box>,
  )
  if (isTyping) {
    out.push(
      <Box key={`q${i}-input-box`} marginTop={1}>
        <Input
          key={`q${i}-input`}
          placeholder="Type your answer, then Enter"
          autoFocus
          onSubmit={value => {
            const text = value.trim()
            if (text !== '') void answer($, i, { kind: 'other', value: text })
          }}
        />
      </Box>,
    )
  }
  out.push(
    <Box key="q-actions" flexDirection="column" marginTop={1}>
      {chipRows(
        els,
        [
          {
            key: 'go',
            label: total - i > 1 ? 'Skip the rest, upgrade now' : 'Upgrade now',
            tone: 'gold',
            hotkey: isTyping ? undefined : 'u',
            onPress: () => void goRewrite($),
          },
          { key: 'send-original', label: ORIGINAL, tone: 'slate', onPress: () => void sendOriginal($) },
          { key: 'cancel', label: 'Cancel', tone: 'quiet', onPress: () => void cancel($) },
        ],
        width,
        'qa',
      )}
    </Box>,
  )
  return out
}

function drawReview($: $, ctx: Ctx, flow: Flow, upgrade: Upgrade): RenderElement[] {
  const { els, width, surface } = ctx
  const { Box, Text, Input } = els
  const shown = flow.isEditing ? flow.draft : upgrade.text
  const actions: Chip[] = [
    { key: 'run', label: 'Run it', tone: 'gold', onPress: () => void runIt($, shown) },
  ]
  if (Input !== undefined) {
    actions.push({
      key: 'edit',
      label: flow.isEditing ? 'Stop editing' : 'Edit',
      tone: 'slate',
      onPress: () =>
        void update($, flowAtom, cur =>
          cur === null ? cur : { ...cur, isEditing: !cur.isEditing, isCopied: false },
        ),
    })
  }
  actions.push(
    { key: 'copy', label: flow.isCopied ? 'Copied' : 'Copy', tone: 'slate', onPress: () => void copyUpgrade($, surface) },
    { key: 'send-original', label: ORIGINAL, tone: 'slate', onPress: () => void sendOriginal($) },
    { key: 'cancel', label: 'Cancel', tone: 'quiet', onPress: () => void cancel($) },
  )
  const out: RenderElement[] = [
    stats(els, width, wordCount(flow.original), wordCount(shown), upgrade.added.length),
    <Box key="r-actions" flexDirection="column" marginTop={1}>
      {chipRows(els, actions, width, 'ra')}
    </Box>,
  ]
  if (upgrade.added.length > 0) {
    out.push(heading(els, width, 'WHAT I ADDED'))
    upgrade.added.forEach((item, i) => {
      wrap(item, Math.max(1, width - 2)).forEach((line, l) =>
        out.push(
          <Box key={`add-${i}-${l}`} flexDirection="row">
            <Text color={GREEN}>{l === 0 ? '+ ' : '  '}</Text>
            <Text color={TEXT}>{line}</Text>
          </Box>,
        ),
      )
    })
  }
  if (flow.isEditing && Input !== undefined) {
    out.push(heading(els, width, 'EDIT THE UPGRADE', 'Enter runs it'))
    out.push(
      <Box key="edit-box" marginTop={1}>
        <Input
          key="edit-input"
          value={flow.draft}
          rows={Math.min(12, Math.max(3, wrap(flow.draft, width - 2).length))}
          autoFocus
          onInput={value =>
            void update($, flowAtom, cur => (cur === null ? cur : { ...cur, draft: value }))
          }
          onSubmit={value => void runIt($, value)}
        />
      </Box>,
    )
    return out
  }
  if (width >= 64) {
    const left = Math.floor((width - 1) / 2)
    out.push(
      <Box key="cards" flexDirection="row" gap={1} marginTop={1}>
        {card(els, left, 'YOUR PROMPT', flow.original, 'plain', 'card-before')}
        {card(els, width - 1 - left, 'THE UPGRADE', shown, 'gold', 'card-after')}
      </Box>,
    )
  } else {
    out.push(
      <Box key="cards" flexDirection="column" marginTop={1}>
        {card(els, width, 'YOUR PROMPT', flow.original, 'plain', 'card-before')}
        {card(els, width, 'THE UPGRADE', shown, 'gold', 'card-after')}
      </Box>,
    )
  }
  return out
}

function drawError($: $, ctx: Ctx, flow: Flow): RenderElement[] {
  const { els, width } = ctx
  const { Box } = els
  const reason = flow.error?.reason ?? 'Something went wrong.'
  return [
    <Box key="err" marginTop={1}>
      {card(
        els,
        width,
        'COULD NOT FINISH THE UPGRADE',
        `Your prompt is safe. Nothing was sent.\n${reason}`,
        'amber',
        'err-card',
      )}
    </Box>,
    <Box key="err-actions" flexDirection="column" marginTop={1}>
      {chipRows(
        els,
        [
          { key: 'retry', label: 'Try again', tone: 'gold', onPress: () => void retry($) },
          { key: 'send-original', label: ORIGINAL, tone: 'slate', onPress: () => void sendOriginal($) },
          { key: 'cancel', label: 'Cancel', tone: 'quiet', onPress: () => void cancel($) },
        ],
        width,
        'ea',
      )}
    </Box>,
  ]
}

function drawCompose($: $, ctx: Ctx): RenderElement[] {
  const { els, width } = ctx
  const { Box, Text, Input } = els
  return [
    heading(els, width, 'YOUR ROUGH PROMPT'),
    Input === undefined ? (
      <Box key="no-input" marginTop={1}>
        <Text color={MUTED}>{clip('Type /better followed by your prompt.', width)}</Text>
      </Box>
    ) : (
      <Box key="compose-box" marginTop={1}>
        <Input
          key="compose-input"
          placeholder="Type the prompt you want upgraded, then Enter"
          rows={3}
          autoFocus
          onSubmit={value => {
            const text = value.trim()
            if (text !== '') void startUpgrade($, text)
          }}
        />
      </Box>
    ),
    <Box key="compose-actions" flexDirection="column" marginTop={1}>
      {chipRows(els, [{ key: 'cancel', label: 'Cancel', tone: 'quiet', onPress: () => void cancel($) }], width, 'ca')}
    </Box>,
  ]
}

function drawHistory($: $, ctx: Ctx, history: HistoryEntry[]): RenderElement[] {
  const { els, width } = ctx
  const { Box, Text, Button } = els
  const out: RenderElement[] = [heading(els, width, 'LAST UPGRADES', `${history.length} of ${HISTORY_LIMIT}`)]
  if (history.length === 0) {
    out.push(
      <Box key="h-empty" marginTop={1}>
        <Text color={MUTED}>{clip('No upgrades yet. Type a prompt to make one.', width)}</Text>
      </Box>,
    )
  }
  history.forEach(entry => {
    const words = `${wordCount(entry.original)} → ${wordCount(entry.upgrade.text)} words`
    const room = Math.max(4, width - words.length - 2)
    out.push(
      <Button
        key={`h-${entry.id}`}
        plain
        onPress={() =>
          void update($, flowAtom, () => ({
            ...freshFlow(entry.original, 'review'),
            id: entry.id,
            questions: entry.questions,
            answers: entry.answers,
            upgrade: entry.upgrade,
            draft: entry.upgrade.text,
          }))
        }
      >
        <Text color={TEXT}>{pad(entry.original.replace(/\s+/g, ' '), room)}</Text>
        <Text color={MUTED}>{`  ${words}`}</Text>
      </Button>,
    )
  })
  out.push(
    <Box key="h-actions" flexDirection="column" marginTop={1}>
      {chipRows(els, [{ key: 'cancel', label: 'Close', tone: 'quiet', onPress: () => void cancel($) }], width, 'ha')}
    </Box>,
  )
  return out
}

// ---------------------------------------------------------------- hooks

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'better',
      description: 'Upgrade a rough prompt: /better <prompt>, /better on|off, /better history',
      argumentHint: '[prompt | on | off | history]',
    })
    const storedAuto = await $.store.get('auto')
    if (typeof storedAuto === 'boolean') await update($, autoAtom, () => storedAuto)
    const storedHistory = await $.store.get('history')
    if (Array.isArray(storedHistory)) {
      await update($, historyAtom, () => (storedHistory as HistoryEntry[]).slice(0, HISTORY_LIMIT))
    }
    // A reload drops in-flight model calls: pick the step back up.
    const flow = await read($, flowAtom)
    if (flow !== null) {
      later($, async () => {
        const isPlaced = await openPane($)
        if (!isPlaced) return
        if (flow.step === 'reading' || flow.step === 'rewriting') {
          const runId = newId()
          await update($, flowAtom, cur => (cur === null ? cur : { ...cur, runId }))
          if (flow.step === 'reading') await runQuestions($, runId)
          else await runRewrite($, runId)
        }
      })
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const decision = route(e, await read($, autoAtom))
    if (decision.kind === 'pass') return next(e)
    if (decision.kind === 'strip') return next({ ...e, text: decision.text })
    // Ask first; only a yes opens the pane.
    let choice: string
    try {
      choice = await $.ui.ask(ASK, { options: [SEND_AS_TYPED, UPGRADE_IT], header: 'Upgrade?' })
    } catch {
      $.clock.after(150, () => {
        $.prompt.fill({ text: e.text }).catch(() => undefined)
      })
      return { drop: KEPT }
    }
    if (choice !== UPGRADE_IT) return next(e)
    const isPlaced = await startUpgrade($, decision.text)
    if (!isPlaced) {
      $.clock.after(150, () => {
        $.prompt.fill({ text: e.text }).catch(() => undefined)
      })
      return { drop: NARROW }
    }
    // Empty the box while the pane works; Cancel puts the words back.
    $.clock.after(150, () => {
      clearDraft($, e.text).catch(() => undefined)
    })
    return { drop: WORKING }
  }).catch(($, e, next) => next(e)) // on any failure the prompt goes through as typed

  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE && e.origin.kind === 'person') {
      // Closing from the frame is a Cancel: the words go back in the box.
      const flow = await read($, flowAtom)
      await update($, flowAtom, () => null)
      if (flow !== null && flow.original !== '' && flow.step !== 'history') {
        await $.prompt.fill({ text: flow.original })
      }
    }
    return closed
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'better' }, async ($, e) => {
    const arg = e.args.trim()
    const word = arg.toLowerCase()
    if (word === 'on') {
      await setAuto($, true)
      return { text: 'Prompt Upgrade is on: when you press Enter it asks whether to upgrade first. Start a prompt with > to skip the question.' }
    }
    if (word === 'off') {
      await setAuto($, false)
      return { text: 'Prompt Upgrade is off: prompts go straight through. /better <prompt> still upgrades one.' }
    }
    if (word === 'history') {
      later($, async () => {
        if (!(await showFlow($, freshFlow('', 'history')))) $.ui.toast(NARROW)
      })
      return { text: 'Opening your last upgrades.' }
    }
    if (arg === '') {
      later($, async () => {
        if (!(await showFlow($, freshFlow('', 'compose')))) $.ui.toast(NARROW)
      })
      return { text: 'Type the prompt you want upgraded in the pane.' }
    }
    later($, async () => {
      if (!(await startUpgrade($, arg))) {
        await $.prompt.fill({ text: arg })
        $.ui.toast(NARROW)
      }
    })
    return { text: 'Upgrading your prompt in the pane.' }
  }).catch(() => ({ text: 'Prompt Upgrade hit a problem and did nothing. Your prompt is safe.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els: Els = $.ui.resolve(e)
    const { Box, Text } = els
    const width = Math.max(20, e.props.bodyColumns)
    const flow = await read($, flowAtom)
    const ctx: Ctx = { els, width, surface: e.surface }
    if (flow === null) {
      return (
        <Box flexDirection="column" width={width}>
          {header(els, width, '')}
          <Text color={MUTED}>{clip('Nothing to upgrade right now.', width)}</Text>
        </Box>
      )
    }
    let right = ''
    let body: RenderElement[]
    if (flow.step === 'history') {
      body = drawHistory($, ctx, await read($, historyAtom))
    } else if (flow.step === 'compose') {
      body = drawCompose($, ctx)
    } else {
      if (flow.step === 'questions') {
        const done = flow.answers.filter(a => a !== null).length
        right = `${done} of ${flow.questions.length} answered`
      }
      const steps = tracker(els, width, stepIndex(flow))
      const rest =
        flow.step === 'reading'
          ? drawWaiting($, ctx, flow, 'Reading your prompt and picking the questions that matter.')
          : flow.step === 'rewriting'
            ? drawWaiting($, ctx, flow, 'Writing the upgrade from your answers.')
            : flow.step === 'questions'
              ? drawQuestions($, ctx, flow)
              : flow.step === 'error'
                ? drawError($, ctx, flow)
                : flow.upgrade !== null
                  ? drawReview($, ctx, flow, flow.upgrade)
                  : drawError($, ctx, { ...flow, error: { stage: 'rewrite', reason: 'The upgrade went missing.' } })
      body = [steps, ...rest]
    }
    return (
      <Box flexDirection="column" width={width}>
        {header(els, width, right)}
        {body}
      </Box>
    )
  })
}
