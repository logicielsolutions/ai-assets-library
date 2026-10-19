# guard

A Claude Code mod that keeps secrets out of the conversation. If you paste an API key, token or password into a prompt, guard stops and asks what to do before anything is sent: redact it, send it as typed, or hand the prompt back so you can edit it. It also hides secrets in what tools read or print, and asks before Claude writes a secret to a file or runs a command containing one.

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
| Your prompt | Asks before sending (see below). On **Redact and send** the secret becomes a tag such as `[REDACTED:aws-access-key #1]`, and Claude is told not to ask for the value again. Only the value is removed, so `my api key is …` keeps the rest of the sentence. |
| Tool output (`Bash`, `Read`, `Grep`) | Redacts secrets in what the tool returned before the model sees it. |
| `Write`, `Edit`, `Bash` | Asks **Allow it / Block it** when the content or command contains a secret. Writes to `.env` files are always allowed. |

**When a secret is in your prompt**, guard shows a dialog before anything is sent:

```
Your prompt has a possible secret (aws-access-key AKI…(20 chars)). Redact it before sending?
  1. Redact and send
  2. Send as typed
  3. Don't send, let me edit
```

- **Redact and send:** the secret is replaced with a tag; the rest of the prompt goes as typed.
- **Send as typed:** for a test or throw-away value; guard still logs it in `/guard`.
- **Don't send, let me edit:** nothing is sent and your prompt goes back into the prompt box.
- **Esc** works like "Don't send". Prompts nobody can answer for (`claude -p`, other plugins) are redacted without asking.

Prefer no dialog? Set `mode` to `redact` (always redact) or `warn` (always send, with a warning).

**Detected by default:** AWS keys, GitHub, Slack, Stripe and Anthropic tokens, JWTs, private keys (PEM), passwords in URLs, bearer tokens, `password=` / `API_KEY=` style assignments with a secret-looking value, spoken-style secrets ("my password is …"), and any value from the repo's `.env` files wherever it appears.

If something real was caught, rotate it anyway: guard protects this conversation, not your clipboard or shell history.

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
| `mode` | `ask` | `ask`: ask each time (redact, send as typed, or edit). `redact`: always replace the secret before sending. `warn`: send as typed, but warn |
| `scanEnv` | on | Learn values from the repo's `.env` files and catch them anywhere |
| `guardActions` | on | Ask before a secret is written by `Write`/`Edit` or run by `Bash` |
| `extraNames` | off | Extra security also flags names and places (noisier) |
| `extraMinScore` | `0.4` | Extra security's minimum confidence. 0.4 catches every item in the `/guard setup` sample; lower catches more and flags more false alarms, above 0.4 misses phone numbers, then PAN and IP. Blank means 0.4. `/guard setup` shows the value in use and warns when it is off the suggested range. |

## Develop

```bash
claude --plugin-dir mods/guard     # run a session with it loaded
claude plugin validate mods/guard  # check manifest + hooks
claude plugin test mods/guard      # run hooks/*.test.ts
```

Test fixtures use fake values in real formats; none are live credentials.
