# prompt-upgrade

A Claude Code mod that turns a rough prompt into a sharp one before it's sent. Type `/better <prompt>` and a pane opens: Haiku asks up to 2 quick questions, rewrites the prompt, and shows the original and the rewrite side by side. Nothing is sent until you press Run.

## Install

```
/plugin install prompt-upgrade --marketplace logicielsolutions/ai-assets-library
```

Answer `y` to add the marketplace, then pick a scope (user scope = every session).

## Use

| Command | What it does |
|---------|-------------|
| `/better <prompt>` | Upgrade one prompt |
| `/better on` | Ask "Upgrade?" every time you press Enter (default) |
| `/better off` | Send prompts straight through; `/better <prompt>` still works |
| `/better history` | Reopen your last upgrades |

- Start a prompt with `>` to skip the question and send it as typed.
- Cancel (or closing the pane) puts your original words back in the prompt box.
- If anything fails, your prompt goes through as typed.

## Develop

```bash
claude --plugin-dir mods/prompt-upgrade     # run a session with it loaded
claude plugin validate mods/prompt-upgrade  # check manifest + hooks
claude plugin test mods/prompt-upgrade      # run tests/prompt-upgrade.test.ts
```
