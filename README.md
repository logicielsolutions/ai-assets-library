# ai-assets-library

A public library of reusable **Claude Code skills and mods** — open for anyone to use and contribute to.

This repo is also a **Claude Code plugin marketplace**, so everything here installs with one `/plugin install` line.

Skills are drop-in prompt modules for Claude Code. Copy a skill folder into your project, invoke it by name, and Claude follows a structured, tested workflow for that task — so you get consistent results without re-explaining the process every time.

---

## Skills

| Skill | What it does | Invoke with |
|-------|-------------|-------------|
| [`grill-me`](skills/grill-me/) | Stress-tests a plan or design by interviewing you relentlessly, one question at a time, until every branch of the decision tree is resolved | `/grill-me` |
| [`git-push`](skills/git-push/) | Safe commit-and-push: reviews changes, scans for secrets, drafts a commit message, confirms with you, then pushes | `/git-push` |
| [`claude-design`](skills/claude-design/) | Generates a complete, ready-to-paste prompt for [claude.ai/design](https://claude.ai/design) — reads your project context automatically so the slides contain real content, not placeholders | `/claude-design` |
| [`meeting-summary`](skills/meeting-summary/) | Turns a meeting transcript into a structured summary: decisions, action items, key insights, open questions. Includes a Fathom fetch script to pull transcripts automatically. | `/meeting-summary` |
| [`jira-story-writer`](skills/jira-story-writer/) | Creates self-contained, agent-ready Jira tickets from a one-line description — reads your codebase to fill in real file paths, patterns, and acceptance criteria | `/jira-story-writer` |
| [`teach`](skills/teach/) | Builds a stateful teaching workspace for learning a topic over multiple sessions: mission, resources, lessons, references, and learning records | `/teach` |
| [`design-system-creator`](skills/design-system-creator/) | Produces a complete, Claude-Design-ready design system folder for any brand — builds one from scratch via research, or extracts it from an existing business's site and shipped assets | `/design-system-creator` |

---

## Mods

Mods change Claude Code itself: status-line entries, panes, toasts, slash commands, hooks on tool calls or prompts. Each one lives in [`mods/`](mods/).

| Mod | What it does | Install |
|-----|-------------|---------|
| [`git-status-line`](mods/git-status-line/) | Shows the current git branch and changed-file count in the status line, refreshed after every turn | `/plugin install git-status-line --marketplace logicielsolutions/ai-assets-library` |
| [`prompt-upgrade`](mods/prompt-upgrade/) | `/better <prompt>` asks a few quick questions, rewrites your prompt, and shows both side by side; nothing is sent until you press Run | `/plugin install prompt-upgrade --marketplace logicielsolutions/ai-assets-library` |
| [`model-switcher`](mods/model-switcher/) | A band above the prompt for switching model and effort with one click or keypress; the model list comes from Claude Code, so it stays current | `/plugin install model-switcher --marketplace logicielsolutions/ai-assets-library` |
| [`guard`](mods/guard/) | Removes API keys, tokens and passwords from your prompts before they are sent, hides them in tool output, and asks before Claude writes or runs one; `/guard setup` adds optional local PII detection (Presidio) | `/plugin install guard --marketplace logicielsolutions/ai-assets-library` |

---

## Why this exists

Claude Code skills let you encode a workflow once and reuse it across every project. Instead of writing the same prompt from scratch or copy-pasting instructions into every new session, you drop a skill folder into `.claude/skills/` and invoke it by name.

This library is a collection of skills that turned out to be genuinely reusable across projects. They're open-sourced so other teams building with Claude Code don't have to reinvent the same workflows.

---

## How to install

### Via the marketplace (recommended)

In a Claude Code terminal session:

```
/plugin install ai-assets-skills --marketplace logicielsolutions/ai-assets-library   # all skills
/plugin install git-status-line  --marketplace logicielsolutions/ai-assets-library   # a mod
```

Answer `y` to add the marketplace, then pick a scope (user scope = every session). Plugin skills are namespaced, e.g. `/ai-assets-skills:git-push`. Run `/plugin` to update or remove them later.

To have everyone on a project prompted to install, add this to that project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "ai-assets-library": { "source": { "source": "github", "repo": "logicielsolutions/ai-assets-library" } }
  },
  "enabledPlugins": { "git-status-line@ai-assets-library": true, "ai-assets-skills@ai-assets-library": true }
}
```

### Copy a single skill

1. Copy the skill folder into your project's `.claude/skills/` directory:
   ```bash
   cp -r skills/git-push /your-project/.claude/skills/
   ```
2. If the skill has a `README.md`, open it — some skills need placeholders configured or dependencies installed before first use.
3. In a Claude Code session, invoke it:
   ```
   /git-push
   ```

That's it. No build step, no package manager.

### Skills with extra setup

Some skills need configuration before use:

| Skill | What to configure |
|-------|------------------|
| [`claude-design`](skills/claude-design/README.md) | Your brand accent colour (`<ACCENT_HEX>`) + project context file paths |
| [`meeting-summary`](skills/meeting-summary/README.md) | `FATHOM_API_KEY` + `FATHOM_RECORDED_BY` in `.env` (only if using Fathom); install `requests python-dotenv` |
| [`jira-story-writer`](skills/jira-story-writer/README.md) | `<JIRA_CLOUD_ID>`, `<PROJECT_KEY>`, `<CONFLUENCE_SPACE>`, `<PARENT_PAGE>` in the SKILL.md |
| [`teach`](skills/teach/) | No external credentials; the skill creates and maintains learning workspace files such as `MISSION.md`, `RESOURCES.md`, `lessons/`, `reference/`, and `learning-records/` |
| [`design-system-creator`](skills/design-system-creator/README.md) | Firecrawl CLI (free API key), `extract-design-system`, Playwright Chromium — the skill runs a diagnostic and guides installation |

Open the skill's `README.md` for the full setup guide.

---

## How to contribute

1. Fork this repo.
2. Create a new folder under `skills/` using a kebab-case name (e.g. `my-skill/`).
3. Add a `SKILL.md` with `name` and `description` frontmatter:
   ```markdown
   ---
   name: my-skill
   description: One-line description of what this skill does
   ---

   <!-- skill instructions here -->
   ```
4. Add a `README.md` explaining what the skill does, how to invoke it, and any configuration needed.
5. Make sure the skill is **self-contained** — no secrets, no hardcoded internal IDs, runnable by anyone with no prior knowledge of your project.
6. Open a pull request.

### Contributing a mod

1. Draft it with `/plugin-authoring` in a Claude Code session, or run your folder live with `claude --plugin-dir mods/<name>`.
2. Put it in `mods/<kebab-name>/` with `.claude-plugin/plugin.json`, `hooks/hooks.json` and the hooks module (see [`git-status-line`](mods/git-status-line/) for the shape).
3. Add at least one `hooks/*.test.ts`, then check it:
   ```bash
   claude plugin validate mods/<name>
   claude plugin test mods/<name>
   ```
4. Add an entry to [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) and a row to the Mods table above, then run `claude plugin validate .`.
5. Bump `version` in the mod's `plugin.json` on every change so teammates get the update.
6. Open a pull request.

---

## Conventions

- Folder names: kebab-case (`my-skill/`, not `MySkill/`)
- Entry point: `SKILL.md` — required, must have `name` + `description` frontmatter
- `README.md` — required for any skill that needs configuration or has dependencies
- No secrets, API keys, or internal URLs committed
- Use `<PLACEHOLDER>` syntax for values the user must configure, and document each one in the README

---

## License

MIT — see [LICENSE](LICENSE) (coming soon).

---

Built with [Claude Code](https://claude.ai/code).
