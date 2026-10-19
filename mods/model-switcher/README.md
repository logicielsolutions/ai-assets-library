# model-switcher

A Claude Code mod that puts the model and effort level in a band above the prompt. Click a chip, or press a key, to switch them; no slash commands.

```
 Model   haiku   sonnet  [● opus]  fable   Opus 5.5
 Effort  auto (high)  low  med  high  xhigh  [● max]     Quick  Build  Deep
```

The status line shows what's running, e.g. `Opus 5.5 · max`.

## Install

```
/plugin install model-switcher --marketplace logicielsolutions/ai-assets-library
```

## Use

- **Mouse:** click a chip.
- **Keyboard:** `ctrl+x tab` focuses the band, then:

  | Keys | Does |
  |------|------|
  | `1`–`9` | Model chips, in order |
  | `a` | Effort: auto (the model's own default) |
  | `q` `w` `e` `r` `t` | Effort: low, med, high, xhigh, max |
  | `z` `x` `c` … | Presets, in order |
  | `esc` | Back to the prompt |

- **Narrow terminals** (under 72 columns): two buttons, `m` cycles the model and `e` cycles the effort.
- `[-]` at the right of the band collapses it.
- When the conversation is long, the band shows `⚠ switching resets the cache`: a new model can't reuse the prompt cache, so the next request costs more.

## How it stays up to date

- **Models:** a chip switches the session's model through the same `/config` Model setting `/model` uses. Chips are aliases (`opus`, `sonnet`, …), which Claude Code resolves to the newest version of that model, and the label shows the version actually running. When a new model ships, updating Claude Code is enough.
- **Unavailable models:** a chip that Claude Code doesn't offer (retired, or blocked by your org) is drawn struck through and can't be pressed. A switch Claude Code refuses shows a toast with the reason.
- **Effort:** there is no effort setting to change, so the mod applies your pick to each request of the main conversation. Models without effort support ignore it. `auto` sends what Claude Code would have sent anyway.

As with `/model`, a model switch is saved as your default in `~/.claude/settings.json`.

## Settings

Under `/config` (or `pluginConfigs.model-switcher.options` in settings):

| Setting | Default | What it does |
|---------|---------|--------------|
| `models` | `haiku, sonnet, opus, fable` | Chips to show, in order: aliases or full ids. `all` shows every model Claude Code offers, e.g. `opus[1m]` |
| `presets` | `Quick=haiku/low, Build=sonnet/high, Deep=opus/max` | One-press `Name=model/effort` pairs; empty hides them |
| `subagents` | off | Apply the effort pick to subagents too |
| `rememberEffort` | on | Keep the effort pick across sessions |

## Develop

```bash
claude --plugin-dir mods/model-switcher     # run a session with it loaded
claude plugin validate mods/model-switcher  # check manifest + hooks
claude plugin test mods/model-switcher      # run tests/model-switcher.test.ts
```
