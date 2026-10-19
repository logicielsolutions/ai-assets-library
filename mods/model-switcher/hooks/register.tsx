import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Effort } from '../types'
import {
  CACHE_HINT_MESSAGES,
  EFFORT_COLOR,
  EFFORT_NAME,
  EFFORTS,
  PRESET_ICONS,
  bars,
  chips,
  cycle,
  effortText,
  familyColor,
  isEffort,
  presets,
  pretty,
  statusLine,
} from './logic'

const offered = atom({ plugin: 'model-switcher', key: 'offered' } as const, [] as string[])
const current = atom({ plugin: 'model-switcher', key: 'current' } as const, '')
const resolved = atom({ plugin: 'model-switcher', key: 'resolved' } as const, '')
const effort = atom({ plugin: 'model-switcher', key: 'effort' } as const, null as Effort | null)
const baseEffort = atom({ plugin: 'model-switcher', key: 'baseEffort' } as const, null as Effort | null)
const messages = atom({ plugin: 'model-switcher', key: 'messages' } as const, 0)
const isKeyboard = atom({ plugin: 'model-switcher', key: 'isKeyboard' } as const, false)

const STORE_EFFORT = 'effort'
const MODEL_HOTKEYS = '123456789'
const EFFORT_HOTKEYS: Record<Effort, string> = { low: 'q', medium: 'w', high: 'e', xhigh: 'r', max: 't' }
const PRESET_HOTKEYS = 'zxcvb'
// Below this many columns the band is two cycling buttons instead of rows of chips.
const WIDE_COLUMNS = 72

async function showStatus($: EngineInterface) {
  $.ui.status(statusLine(await read($, resolved), await read($, effort), await read($, baseEffort)))
}

// Reads the model back from Claude Code: the /config row and what it resolves to.
async function refresh($: EngineInterface) {
  const row = (await $.config.list()).find(r => r.key === 'model')
  const id = await $.session.model()
  await update($, offered, () => (row?.options ? [...row.options] : []))
  await update($, current, () => (typeof row?.value === 'string' ? row.value : ''))
  await update($, resolved, () => id)
  await showStatus($)
}

async function pickModel($: EngineInterface, model: string) {
  const result = await $.config.set({ key: 'model', value: model })
  if (result.deny !== undefined) {
    $.ui.toast(`Couldn't switch to ${model}: ${result.deny}`)
  }
  await refresh($)
}

async function pickEffort($: EngineInterface, next: Effort | null, isRemembered: boolean) {
  await update($, effort, () => next)
  if (isRemembered) {
    await (next === null ? $.store.delete(STORE_EFFORT) : $.store.set(STORE_EFFORT, next))
  }
  await showStatus($)
}

export const register: Register = (on, options) => {
  const configured = String(options.models ?? 'haiku, sonnet, opus, fable')
  const presetList = presets(String(options.presets ?? ''))
  const isForSubagents = options.subagents === true
  const isRemembered = options.rememberEffort !== false

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    if (isRemembered) {
      const kept = await $.store.get(STORE_EFFORT)
      await update($, effort, () => (isEffort(kept) ? kept : null))
    }
    await refresh($)

    return started
  })

  // The effort pick rides on every request of the main conversation (and the
  // subagents' when the option says so). The model needs no rewrite: the pick
  // changed the session's own model.
  on('turn.step', async function* ($, e, next) {
    const isMain = e.agentId === undefined
    if (isMain) {
      const seen = isEffort(e.effort) ? e.effort : null
      if (seen !== (await read($, baseEffort))) {
        await update($, baseEffort, () => seen)
        await showStatus($)
      }
      if (e.model !== (await read($, resolved))) {
        await update($, resolved, () => e.model)
        await showStatus($)
      }
      await update($, messages, () => e.messageCount)
    }
    const pick = await read($, effort)
    const applies = pick !== null && e.effort !== undefined && (isMain || isForSubagents)

    return yield* next(applies ? { ...e, effort: pick } : e)
  })

  // The model changed elsewhere (/model, the /config menu): show it.
  on('config.set', { key: 'model' }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) await refresh($)

    return result
  }).catch(($, e, next) => next(e))

  on('classic.PostModelSwitch', async ($, e, next) => {
    const result = await next(e)
    await refresh($)

    return result
  }).catch(($, e, next) => next(e))

  // Hotkeys only work while the band holds the keyboard, so their hints show only then.
  on('ui.focus', { component: 'AbovePrompt' }, async ($, e, next) => {
    const result = await next(e)
    await update($, isKeyboard, () => e.element !== undefined)

    return result
  })

  // Esc back to the prompt raises nothing, so typing there is what hides them.
  on('prompt.edit', async ($, e, next) => {
    if (await read($, isKeyboard)) await update($, isKeyboard, () => false)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (await read($, isKeyboard)) await update($, isKeyboard, () => false)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const model = await read($, current)
    const id = await read($, resolved)
    const pick = await read($, effort)
    const base = await read($, baseEffort)
    const count = await read($, messages)
    const list = chips(configured, await read($, offered), model)
    if (list.length === 0) return next(e)
    const kb = await read($, isKeyboard)
    const key = (hotkey: string | undefined) => (kb ? hotkey : undefined)

    // The meter shows the pick, or under auto the model's own default, dimmer.
    const shown = pick ?? base
    const tone = shown === null ? 'subtle' : EFFORT_COLOR[shown]
    const filled = bars(shown)
    const running = (
      <Text>
        <Text color={familyColor(id)}>◆ </Text>
        <Text dimColor>{pretty(id)}</Text>
      </Text>
    )
    const hint = count >= CACHE_HINT_MESSAGES ? <Text color="warning">⚠ switching resets the cache   </Text> : null

    const meter = EFFORTS.map((level, i) => (
      <Button
        key={`effort:${level}`}
        plain
        hotkey={key(EFFORT_HOTKEYS[level])}
        onPress={() => pickEffort($, level, isRemembered)}
      >
        <Text color={i < filled ? tone : 'subtle'} dimColor={pick === null}>
          {i < filled ? '▰' : '▱'}
        </Text>
      </Button>
    ))

    if (e.props.bodyColumns < WIDE_COLUMNS) {
      const available = list.filter(c => c.isAvailable).map(c => c.value)

      return (
        <Box gap={2} marginTop={1}>
          <Button key="cycle-model" plain hotkey={key('m')} onPress={() => pickModel($, cycle(available, model))}>
            <Text color={familyColor(model)} bold>
              ◆ {model || 'model'}
            </Text>
            <Text dimColor> ▾</Text>
          </Button>
          <Button key="cycle-effort" plain hotkey={key('e')} onPress={() => pickEffort($, cycle([null, ...EFFORTS], pick), isRemembered)}>
            <Text color={tone}>{'▰'.repeat(filled)}</Text>
            <Text color="subtle">{'▱'.repeat(5 - filled)}</Text>
            <Text dimColor> {effortText(pick, base)} ▾</Text>
          </Button>
          {running}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text bold dimColor>
            {'MODEL   '}
          </Text>
          <Box gap={1}>
            {list.map((chip, i) => {
              const color = familyColor(chip.value)
              if (!chip.isAvailable) {
                return (
                  <Text dimColor strikethrough>
                    {` ◇ ${chip.value} `}
                  </Text>
                )
              }

              return (
                <Button key={`model:${chip.value}`} plain hotkey={key(MODEL_HOTKEYS[i])} onPress={() => pickModel($, chip.value)}>
                  {chip.value === model ? (
                    <Text backgroundColor={color} color="inverseText" bold>
                      {` ◆ ${chip.value} `}
                    </Text>
                  ) : (
                    <Text>
                      <Text color={color}> ◇ </Text>
                      <Text dimColor>{chip.value} </Text>
                    </Text>
                  )}
                </Button>
              )
            })}
          </Box>
          <Box flexGrow={1} />
          {hint}
          {running}
        </Box>
        <Box>
          <Text bold dimColor>
            {'EFFORT   '}
          </Text>
          <Box gap={1}>{meter}</Box>
          <Text>{'  '}</Text>
          <Box width={14}>
            <Text color={tone} bold={pick !== null} dimColor={pick === null}>
              {pick === null ? effortText(null, base) : EFFORT_NAME[pick]}
            </Text>
          </Box>
          <Button key="effort:auto" plain hotkey={key('a')} onPress={() => pickEffort($, null, isRemembered)}>
            {pick === null ? (
              <Text backgroundColor="subtle" color="inverseText" bold>
                {' ↺ auto '}
              </Text>
            ) : (
              <Text dimColor>↺ auto</Text>
            )}
          </Button>
          <Box flexGrow={1} />
          <Box gap={2}>
            {presetList.map((preset, i) => (
              <Button
                key={`preset:${preset.name}`}
                plain
                hotkey={key(PRESET_HOTKEYS[i])}
                onPress={async () => {
                  await pickModel($, preset.model)
                  await pickEffort($, preset.effort, isRemembered)
                }}
              >
                <Text color={familyColor(preset.model)}>{PRESET_ICONS[i % PRESET_ICONS.length]} </Text>
                <Text dimColor>{preset.name}</Text>
              </Button>
            ))}
          </Box>
        </Box>
      </Box>
    )
  })
}
