# guard

A Claude Code mod that keeps secrets out of the conversation. If you paste an API key, token or password into a prompt, guard swaps it for a `[REDACTED:…]` tag before the prompt is sent and warns you. It also hides secrets in what tools read or print, and asks before Claude writes a secret to a file or runs a command containing one.

```
🛡 guard on · extra security off (/guard setup)
```

The status line always shows whether guard is on and how many secrets it caught.

## Install

```
/plugin install guard --marketplace logicielsolutions/ai-assets-library
```

## What it does

| Where | What guard does |
|-------|-----------------|
| Your prompt | Replaces the secret with a tag such as `[REDACTED:aws-access-key #1]` before sending, shows a toast, and tells Claude not to ask for the value again. Only the value is removed, so `my api key is …` keeps the rest of the sentence. |
| Tool output (`Bash`, `Read`, `Grep`) | Redacts secrets in what the tool returned before the model sees it. |
| `Write`, `Edit`, `Bash` | Asks **Allow it / Block it** when the content or command contains a secret. Writes to `.env` files are always allowed. |

**Detected by default:** AWS keys, GitHub, Slack, Stripe and Anthropic tokens, JWTs, private keys (PEM), passwords in URLs, bearer tokens, `password=` / `API_KEY=` style assignments with a secret-looking value, spoken-style secrets ("my password is …"), and any value from the repo's `.env` files wherever it appears.

guard redacts and warns; it does not stop a prompt from being sent. If something real was caught, rotate it.

## Commands

| Command | Does |
|---------|------|
| `/guard` | What was caught this session (values never shown) and whether extra security is on |
| `/guard test <text>` | Shows what each layer would catch; nothing is sent |
| `/guard scan [path]` | Scans a file or folder (default: the current folder) for secrets |
| `/guard allow` | Marks everything caught so far as a false positive for this session |
| `/guard off` / `/guard on` | Turns guard off or on for this session |
| `/guard setup` | Opens the extra-security pane |
| `/guard extra off` / `/guard extra remove` | Turns extra security off (and optionally deletes its files) |

## Extra security (optional, off by default)

[Microsoft Presidio](https://microsoft.github.io/presidio/) runs as a second detector that adds emails, phone numbers, card numbers, Aadhaar, PAN, SSN, IBAN, IP addresses and crypto wallets. `/guard setup` shows the steps, the download size and a before/after table on a made-up sample, and has an **Enable extra security** button.

Enabling it:

- creates a Python virtual env in `~/.claude/guard/venv` (needs Python 3.9 to 3.14), installs `presidio-analyzer` and `spacy` with the small English model (about 200 MB),
- starts `worker/presidio_server.py`, a local HTTP server on `127.0.0.1:53917` that never logs text and exits after 2 hours idle,
- remembers the choice across sessions.

Everything stays on your machine. If the detector stops answering, guard falls back to the default rules and restarts it.

## Settings

Under `/config` (or `pluginConfigs.guard.options` in settings):

| Setting | Default | What it does |
|---------|---------|--------------|
| `mode` | `redact` | `redact`: replace the secret before sending. `warn`: send as typed, but warn |
| `scanEnv` | on | Learn values from the repo's `.env` files and catch them anywhere |
| `guardActions` | on | Ask before a secret is written by `Write`/`Edit` or run by `Bash` |
| `extraNames` | off | Extra security also flags names and places (noisier) |
| `extraMinScore` | `0.4` | Extra security's minimum confidence; lower catches more |

## Develop

```bash
claude --plugin-dir mods/guard     # run a session with it loaded
claude plugin validate mods/guard  # check manifest + hooks
claude plugin test mods/guard      # run hooks/*.test.ts
```

Test fixtures use fake values in real formats; none are live credentials.
