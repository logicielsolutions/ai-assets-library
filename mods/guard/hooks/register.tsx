import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CompareRow as Row, ExtraStatus } from '../types'

import { findSecrets, isEnvFile, isSecretHome, lineOf, mask, newRegistry, parseEnv, redact, settle } from './detect'
import type { Finding, Registry } from './detect'
import {
  IDLE_MINUTES,
  NAME,
  NAME_ENTITIES,
  PORT,
  SAMPLE,
  STRUCTURED_ENTITIES,
  compareRows,
  fromAnalyzer,
  lastLines,
  pythonOk,
  setupSteps,
  statusText,
} from './extra'
import type { AnalyzerHit } from './extra'

const ALLOW = 'Allow it'
const BLOCK = 'Block it'
const READ_TOOLS = new Set(['Bash', 'Read', 'Grep'])
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv'])

type Caught = { where: string; label: string; hint: string }

type State = {
  isOn: boolean
  known: string[]
  allowed: Set<string>
  registry: Registry
  caught: Caught[]
  loadedAt: number
  extra: ExtraStatus
  wantsNames: boolean
  minScore: number
  hasWarnedDown: boolean
}

const describeFindings = (found: readonly Finding[]): string => {
  const counts = new Map<string, number>()
  for (const f of found) counts.set(f.label, (counts.get(f.label) ?? 0) + 1)
  return [...counts].map(([label, n]) => (n > 1 ? `${label} ×${n}` : label)).join(', ')
}

function note(state: State, where: string, found: readonly Finding[]) {
  for (const f of found) state.caught.push({ where, label: f.label, hint: mask(f.value) })
  if (state.caught.length > 200) state.caught.splice(0, state.caught.length - 200)
}

// The always-visible sign that guard is working.
function showStatus($: EngineInterface, state: State) {
  $.ui.status(statusText(state.isOn, state.extra, state.caught.length))
}

// Learns the secret values in the repo's .env files, so they are caught
// wherever they show up.
async function learnEnv($: EngineInterface, state: State) {
  try {
    const cwd = await $.session.cwd()
    const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd }).catch(() => null)
    const root = top?.exitCode === 0 ? top.stdout.trim() : cwd
    const values: string[] = []
    for (const entry of await $.fs.list(root)) {
      if (entry.kind === 'file' && isEnvFile(entry.name)) {
        values.push(...parseEnv((await $.fs.read(`${root}/${entry.name}`)) as string))
      }
    }
    state.known = [...new Set(values)]
    state.loadedAt = await $.clock.now()
  } catch {
    // no readable .env files: the format rules still apply
  }
}

// Redacts every string inside a tool's result, keeping its shape so the
// engine still accepts it.
const deepRedact = (value: unknown, fn: (s: string) => string): unknown => {
  if (typeof value === 'string') return fn(value)
  if (Array.isArray(value)) return value.map(v => deepRedact(v, fn))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, deepRedact(v, fn)]))
  }
  return value
}

const extraAtom = atom({ plugin: 'guard', key: 'extra' } as const, 'off' as ExtraStatus)
const setupLog = atom({ plugin: 'guard', key: 'setupLog' } as const, [] as string[])
const compare = atom({ plugin: 'guard', key: 'compare' } as const, [] as Row[])

// A local call that hangs must never hold up a prompt.
async function withTimeout<T>($: EngineInterface, work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    $.clock.sleep(ms).then(() => {
      throw new Error(`no answer in ${ms / 1000}s`)
    }),
  ])
}

async function paths($: EngineInterface) {
  const home = (await $.env.get('HOME')) ?? ''
  const base = `${home}/.claude/guard`
  return { base, py: `${base}/venv/bin/python`, pid: `${base}/presidio.pid`, script: `${$.plugin.root}/worker/presidio_server.py` }
}

async function isUp($: EngineInterface): Promise<boolean> {
  try {
    return (await withTimeout($, $.http.fetch(`http://127.0.0.1:${PORT}/health`), 1500)).ok
  } catch {
    return false
  }
}

// Starts the detector in the background; it stops by itself when idle.
async function startServer($: EngineInterface): Promise<boolean> {
  if (await isUp($)) return true
  const p = await paths($)
  if (!(await $.fs.exists(p.py))) return false
  await $.process.run(['/bin/sh', '-c', 'nohup "$0" "$@" >/dev/null 2>&1 &', p.py, p.script, String(PORT), String(IDLE_MINUTES), p.pid], { timeoutMs: 10000 })
  for (let i = 0; i < 40; i++) {
    await $.clock.sleep(500)
    if (await isUp($)) return true
  }
  return false
}

// What the extra layer would flag in `text`; null when it is not available.
async function analyzeExtra($: EngineInterface, state: State, text: string): Promise<Finding[] | null> {
  if (!(await isUp($))) return null
  const wanted = state.wantsNames ? [...STRUCTURED_ENTITIES, ...NAME_ENTITIES] : STRUCTURED_ENTITIES
  const r = await withTimeout(
    $,
    $.http.fetch(`http://127.0.0.1:${PORT}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, entities: wanted, score_threshold: state.minScore }),
    }),
    3000,
  )
  if (!r.ok) return null
  return fromAnalyzer(text, JSON.parse(r.text) as AnalyzerHit[], wanted, state.minScore)
}

async function refreshCompare($: EngineInterface, state: State) {
  const basic = findSecrets(SAMPLE)
  const extra = state.extra === 'on' ? await analyzeExtra($, state, SAMPLE).catch(() => null) : null
  await update($, compare, () => compareRows(basic, extra))
}

// Tool output carries colour codes; the pane refuses any control character.
const clean = (text: string): string =>
  // eslint-disable-next-line no-control-regex
  text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')

async function addLog($: EngineInterface, line: string) {
  await update($, setupLog, l => [...l, clean(line)].slice(-14))
}

// The button: download what is needed, one visible step at a time.
async function setupExtra($: EngineInterface, state: State) {
  state.extra = 'installing'
  await update($, extraAtom, () => 'installing')
  await update($, setupLog, () => [])
  showStatus($, state)
  const p = await paths($)
  try {
    for (const step of setupSteps(p.base, p.py)) {
      await addLog($, `▶ ${step.title}`)
      await addLog($, `  $ ${step.argv.join(' ')}`)
      const stream = $.process.spawn({ argv: step.argv })
      let output = ''
      for await (const chunk of stream) {
        output += chunk.text
        for (const line of lastLines(chunk.text, 2)) await addLog($, `  ${line.slice(0, 110)}`)
      }
      const { code } = await stream.result
      if (code !== 0) throw new Error(`${step.title} failed (exit ${code}). ${lastLines(output, 2).join(' ')}`)
      if (step.title === 'Check Python') {
        const v = pythonOk(output)
        await addLog($, `  Python ${v.label}${v.ok ? ' ✓' : ''}`)
        if (!v.ok) throw new Error(`Python ${v.label} is not supported here (3.9 to 3.14 needed)`)
      }
    }
    await addLog($, '▶ Start the local detector')
    if (!(await startServer($))) throw new Error('the detector did not start')
    await $.store.set('guard.extra', 'on')
    state.extra = 'on'
    await update($, extraAtom, () => 'on')
    await addLog($, '✓ Extra security is on')
    await refreshCompare($, state)
  } catch (err) {
    state.extra = 'error'
    await update($, extraAtom, () => 'error')
    await addLog($, `✗ ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`)
  }
  showStatus($, state)
}

// Stops the detector and, when asked, deletes the downloaded files.
async function turnOffExtra($: EngineInterface, state: State, isRemove: boolean) {
  const p = await paths($)
  try {
    const pid = ((await $.fs.read(p.pid)) as string).trim()
    if (/^\d+$/.test(pid)) await $.process.run(['kill', pid])
  } catch {
    // not running
  }
  if (isRemove && p.base.endsWith('/.claude/guard')) await $.process.run(['rm', '-rf', `${p.base}/venv`])
  await $.store.set('guard.extra', 'off')
  state.extra = 'off'
  await update($, extraAtom, () => 'off')
  await update($, setupLog, () => [isRemove ? 'Extra security turned off and files removed.' : 'Extra security turned off (files kept).'])
  await refreshCompare($, state)
  showStatus($, state)
}

async function scanPath($: EngineInterface, state: State, path: string): Promise<string> {
  const rows: string[] = []
  let files = 0
  const walk = async (p: string, depth: number) => {
    if (files >= 300 || depth > 6) return
    let entries
    try {
      entries = await $.fs.list(p)
    } catch {
      // a file, not a folder
      const text = (await $.fs.read(p)) as string
      files += 1
      for (const f of findSecrets(text, state.known, state.allowed)) rows.push(`${p}:${lineOf(text, f.start)}  ${f.label}  ${mask(f.value)}`)
      return
    }
    for (const e of entries) {
      if (e.kind === 'dir' && !SKIP_DIRS.has(e.name)) await walk(`${p}/${e.name}`, depth + 1)
      if (e.kind === 'file' && e.size < 1_000_000 && !isSecretHome(e.name)) {
        try {
          const text = (await $.fs.read(`${p}/${e.name}`)) as string
          files += 1
          for (const f of findSecrets(text, state.known, state.allowed)) rows.push(`${p}/${e.name}:${lineOf(text, f.start)}  ${f.label}  ${mask(f.value)}`)
        } catch {
          // binary or unreadable: skip
        }
      }
    }
  }
  await walk(path, 0)
  return rows.length === 0
    ? `${NAME}: scanned ${files} file(s), nothing found.`
    : [`${NAME}: ${rows.length} possible secret(s) in ${files} file(s). Values are not shown.`, ...rows.slice(0, 60)].join('\n')
}

// Asks before a file write or a command that carries a secret. Returns the
// deny message, or null when it may go ahead.
async function askBeforeAction($: EngineInterface, state: State, what: string, text: string): Promise<string | null> {
  const found = findSecrets(text, state.known, state.allowed)
  if (found.length === 0) return null
  note(state, what, found)
  showStatus($, state)
  const first = found[0]
  let answer: string
  try {
    answer = await $.ui.ask(`${what} contains a possible secret (${describeFindings(found)}${first ? `, line ${lineOf(text, first.start)}` : ''}). Allow it?`, {
      header: 'Secret',
      options: [BLOCK, ALLOW],
    })
  } catch {
    return `${$.plugin.name}: blocked, ${what} contains a possible secret and nobody could approve it. Use an environment variable instead.`
  }
  return answer === ALLOW ? null : `${$.plugin.name}: you declined: ${what} contains a possible secret. Use an environment variable or secret manager instead of the literal value.`
}

export const register: Register = (on, options) => {
  const isRedact = options.mode !== 'warn'
  const wantsEnv = options.scanEnv !== false
  const guardsActions = options.guardActions !== false
  const state: State = {
    isOn: true,
    known: [],
    allowed: new Set(),
    registry: newRegistry(),
    caught: [],
    loadedAt: 0,
    extra: 'off',
    wantsNames: options.extraNames === true,
    minScore: Math.min(1, Math.max(0, Number(options.extraMinScore ?? 0.4))),
    hasWarnedDown: false,
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'guard',
      description: 'guard: what it caught, /guard setup for extra security, /guard test <text>, /guard scan <path>, /guard allow, /guard off|on',
    })
    if (wantsEnv) await learnEnv($, state)
    if ((await $.store.get('guard.extra')) === 'on') {
      state.extra = 'on'
      await update($, extraAtom, () => 'on')
      void startServer($)
    } else if (!(await $.store.get('guard.nudged'))) {
      await $.store.set('guard.nudged', true)
      $.ui.toast('guard: optional extra security is available (emails, phones, cards, Aadhaar, PAN). Run /guard setup to see how.', { timeoutMs: 12000 })
    }
    showStatus($, state)
    return next(e)
  })

  // Your prompt: redact before it is sent, and tell you.
  on('prompt.submit', async ($, e, next) => {
    if (!state.isOn) return next(e)
    if (wantsEnv && (await $.clock.now()) - state.loadedAt > 60000) await learnEnv($, state)

    let found = findSecrets(e.text, state.known, state.allowed)
    if (state.extra === 'on') {
      const extra = await analyzeExtra($, state, e.text).catch(() => null)
      if (extra === null) {
        if (!state.hasWarnedDown) {
          state.hasWarnedDown = true
          $.ui.toast('guard: the extra detector is not answering; basic protection still applies. Restarting it.')
        }
        void startServer($)
      } else {
        found = settle([...found, ...extra.filter(f => !state.allowed.has(f.value))])
      }
    }
    if (found.length === 0) return next(e)

    note(state, 'your prompt', found)
    showStatus($, state)
    const what = describeFindings(found)
    $.ui.toast(
      isRedact
        ? `⚠ You pasted a secret (${what}). It was removed before sending. If it is real, rotate it.`
        : `⚠ Your prompt contains a secret (${what}) and was sent as typed. If it is real, rotate it.`,
      { timeoutMs: 12000 },
    )
    $.ui.log(`⚠ ${NAME}: ${found.length} secret(s) in your prompt (${what}). ${isRedact ? 'Redacted before sending.' : 'Sent as typed.'}`)

    if (!isRedact) return next(e)
    return next({
      ...e,
      text: redact(e.text, found, state.registry),
      context: [
        ...(e.context ?? []),
        'guard removed a secret from the user\'s message and replaced it with a [REDACTED:…] tag. Never ask the user to paste it again; refer to it by its tag and use an environment variable or secret manager.',
      ],
    })
  }).catch(($, e, next) => next(e))

  // One hook for tools: ask before a secret is written or run, then hide
  // secrets in what the tool printed or read before the model sees it.
  on('tool.call', async ($, e, next) => {
    if (!state.isOn) return next(e)

    if (guardsActions) {
      let deny: string | null = null
      if (e.tool === 'Write' && !isSecretHome(e.file_path)) {
        deny = await askBeforeAction($, state, `Writing ${e.file_path}`, e.content)
      } else if (e.tool === 'Edit' && !isSecretHome(e.file_path)) {
        deny = await askBeforeAction($, state, `Editing ${e.file_path}`, e.new_string)
      } else if (e.tool === 'Bash') {
        deny = await askBeforeAction($, state, 'This command', e.command)
      }
      if (deny !== null) return { deny }
    }

    const ran = await next(e)
    if (!READ_TOOLS.has(e.tool) || ran.deny !== undefined || ran.result === undefined) return ran

    try {
      let hits: Finding[] = []
      const cleaned = deepRedact(ran.result, s => {
        const found = findSecrets(s, state.known, state.allowed)
        hits = hits.concat(found)
        return found.length === 0 ? s : redact(s, found, state.registry)
      })
      if (hits.length === 0) return ran

      note(state, `${e.tool} output`, hits)
      showStatus($, state)
      $.ui.log(`⚠ ${NAME}: hid ${hits.length} secret(s) in ${e.tool} output (${describeFindings(hits)}) before the model saw them.`)
      return { ...ran, result: cleaned } as typeof ran
    } catch {
      return ran
    }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: guard failed, action blocked.` }))

  // The setup screen: what the extra layer is, the button, and the difference it makes.
  on('ui.render', { component: 'Pane', requestId: 'guard' }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const extra = await read($, extraAtom)
    const log = await read($, setupLog)
    const rows = await read($, compare)
    const mark = (v: boolean | null) => (v === null ? '—' : v ? '✓' : '✗')
    const steps = setupSteps('~/.claude/guard', '~/.claude/guard/venv/bin/python')

    return (
      <Box flexDirection="column">
        <Text bold>🛡 {NAME}</Text>
        <Text dimColor>Basic protection is on: API keys, tokens, private keys, passwords and the values in your .env files.</Text>

        <Text bold>Extra security: {extra === 'on' ? 'ON' : extra === 'installing' ? 'setting up…' : extra === 'error' ? 'failed' : 'off'}</Text>
        <Text dimColor>Adds emails, phone numbers, credit cards, Aadhaar, PAN, SSN, IBAN and IP addresses (Microsoft Presidio).</Text>
        <Text dimColor>Needs Python 3.9 to 3.14, internet and about 200 MB. Takes about a minute. Everything stays on this machine:</Text>
        <Text dimColor>the detector listens on 127.0.0.1 only, never logs text, and stops itself after {IDLE_MINUTES / 60} hours idle.</Text>
        <Text bold>What Enable does</Text>
        {steps.map((st, i) => (
          <Text dimColor>{i + 1}. {st.title}</Text>
        ))}
        {extra === 'off' || extra === 'error' ? (
          <Button key="enable" label="Enable extra security" onPress={() => {
              void setupExtra($, state)
            }} />
        ) : extra === 'on' ? (
          <Box>
            <Button key="off" label="Turn off" onPress={() => {
                void turnOffExtra($, state, false)
              }} />
            <Text> </Text>
            <Button key="remove" label="Turn off and remove files" onPress={() => {
                void turnOffExtra($, state, true)
              }} />
          </Box>
        ) : (
          <Text color="yellow">Working, please wait…</Text>
        )}
        {log.slice(-10).map(l => (
          <Text dimColor>{clean(l)}</Text>
        ))}

        <Text bold>What gets caught</Text>
        <Text dimColor>Sample: {SAMPLE}</Text>
        <Text bold>{'Item'.padEnd(26)}{'Basic'.padEnd(8)}Extra</Text>
        {rows.map(r => (
          <Text color={r.extra === true && !r.basic ? 'green' : undefined}>
            {r.item.padEnd(26)}{mark(r.basic).padEnd(8)}{mark(r.extra)}
          </Text>
        ))}
        <Text dimColor>{extra === 'on' ? 'Green rows are caught only with extra security.' : 'Turn on extra security to fill in the last column.'} Try your own text: /guard test your text here</Text>
      </Box>
    )
  })

  on('command.run', { command: 'guard' }, async ($, e) => {
    const [cmd = '', ...rest] = e.args.trim().split(/\s+/)
    if (cmd === 'off' || cmd === 'on') {
      state.isOn = cmd === 'on'
      showStatus($, state)
      return { text: `${NAME} is ${state.isOn ? 'on' : 'off'} for this session.` }
    }
    if (cmd === 'setup') {
      await refreshCompare($, state)
      await $.ui.open({ id: 'guard', title: NAME })
      return { text: `${NAME} setup opened.` }
    }
    if (cmd === 'extra' && (rest[0] === 'off' || rest[0] === 'remove')) {
      await turnOffExtra($, state, rest[0] === 'remove')
      return { text: rest[0] === 'remove' ? 'Extra security turned off and its files removed.' : 'Extra security turned off (files kept).' }
    }
    if (cmd === 'test') {
      const text = rest.join(' ')
      if (text === '') return { text: 'Usage: /guard test <text> shows what each layer would catch. Nothing is sent anywhere.' }
      const basic = findSecrets(text, state.known, state.allowed)
      const extra = state.extra === 'on' ? await analyzeExtra($, state, text).catch(() => null) : null
      const line = (found: readonly Finding[]) => (found.length === 0 ? 'nothing' : found.map(f => `${f.label} ${mask(f.value)}`).join(', '))
      return {
        text: [
          `Basic: ${line(basic)}`,
          state.extra === 'on' ? `Extra: ${extra === null ? 'detector not answering' : line(extra.filter(f => !basic.some(b => b.start <= f.start && b.end >= f.end)))}` : 'Extra: off (run /guard setup)',
        ].join('\n'),
      }
    }
    if (cmd === 'allow') {
      const n = state.registry.tags.size
      for (const value of state.registry.tags.keys()) state.allowed.add(value)
      return { text: `${NAME}: ${n} value(s) marked as false positives for this session.` }
    }
    if (cmd === 'scan') {
      const target = rest.join(' ') || (await $.session.cwd())
      return { text: await scanPath($, state, target) }
    }
    const extraLine =
      state.extra === 'on'
        ? 'Extra security: ON (emails, phones, cards, Aadhaar, PAN, SSN, IP). Turn off with /guard extra off.'
        : state.extra === 'installing'
          ? 'Extra security: setting up. Watch /guard setup.'
          : state.extra === 'error'
            ? 'Extra security: setup failed. Run /guard setup to see why and try again.'
            : 'Extra security: OFF. Run /guard setup to see what it adds and enable it with one button.'
    const caughtLines =
      state.caught.length === 0
        ? [`${NAME} is ${state.isOn ? 'on' : 'off'}; nothing caught this session. Learned ${state.known.length} value(s) from .env files.`]
        : [`${NAME} caught ${state.caught.length} secret(s) this session (values not shown):`, ...state.caught.slice(-30).map(c => `- ${c.label} in ${c.where} (${c.hint})`)]
    return { text: [extraLine, ...caughtLines].join('\n') }
  }).catch(() => ({ text: 'guard command failed.' }))
}
