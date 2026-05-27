# claude-design

Generates a complete, ready-to-paste prompt for [claude.ai/design](https://claude.ai/design).

You describe the presentation you need — audience, topic, core message — and this skill produces a detailed prompt you paste directly into Claude Design. Claude Design creates the actual slides. The skill reads your project context files automatically to pull in real content.

Works for: workshops, client pitches, internal demos, team updates, conference talks.

## How to use

```
/claude-design
```

Then describe what you need: "Create a 20-minute workshop on RAG pipelines for our engineering team."

## Configure these placeholders

Open `SKILL.md` and replace the following before using:

| Placeholder | Where it appears | What to put |
|-------------|-----------------|-------------|
| `<ACCENT_HEX>` | Style Defaults → client-pitch section | Your brand accent colour hex code (e.g. `#0052CC`) |

Also review **Step 2** and update the file paths to match your project's context files:
- Primary project context file (currently described generically as `CLAUDE.md`, `README.md`, etc.)
- Project index/overview file
- Meeting summaries folder path
- Decisions/priorities doc path

If your project doesn't have some of these files, remove those steps.

## What stays generic

The prompt template structure (WHO IS PRESENTING, VISUAL STYLE, SLIDE STRUCTURE, etc.) and all style defaults work for any project — only the file paths and brand colour need updating.
