---
name: setup
description: Set up a video workspace for making videos with Claude Code, in the terminal or the Claude desktop app's Code tab - folders, project template, brand file, .env with API key placeholders, HyperFrames, optional Google Flow. Use when someone runs /video-studio:setup, says "set up my video workspace", or when doctor.sh reports something missing. Safe to re-run; it never overwrites existing files.
---

# Video studio setup

Goal: the person ends with a working video workspace and knows how to make a video. They may never have used a terminal, and many run this from the Claude desktop app's Code tab, where they can't type shell commands themselves (no `!` prefix) and the `claude` command may not exist. So run every command yourself, never ask them to type one, and keep every message short and plain.

**Paths.** When this skill loads, the harness prints "Base directory for this skill: <dir>". The plugin root is two folders up from it (`<dir>/../..`). Call it `KIT` below and use the absolute path in every command.

## 1. Pick the folder

- Default: the current folder, if it is empty or already a video workspace (has `projects/_template/`).
- If the current folder is the home folder or has unrelated files, suggest `~/video-studio` and use it unless they name another.
- The workspace itself is fine anywhere. Only the Flow MCP install has to stay out of Desktop, Documents and Downloads (step 6).

## 2. Ask once (one AskUserQuestion call, all four questions)

1. Their name (for `CLAUDE.md`).
2. Brand: Logiciel preset / my own brand (fill `brand/brand.md` later) / none.
3. Voiceover: paste an ElevenLabs key now / add it later / no voiceover.
4. Google Flow for generated images and clips: set it up now (needs Chrome + a Google account, ~5 min) / skip, code-only visuals.

If they paste a key in chat, write it straight to `.env` and never echo it back.

## 3. Copy the template (never overwrite)

```bash
mkdir -p "<WS>" && cp -Rn "KIT/templates/workspace/." "<WS>/"
[ -f "<WS>/.env" ] || cp "<WS>/.env.example" "<WS>/.env"; chmod 600 "<WS>/.env"
```

- Replace `<YOUR_NAME>` in `<WS>/CLAUDE.md`.
- Logiciel preset: `cp "KIT/templates/workspace/brand/presets/logiciel.md" "<WS>/brand/brand.md"` (only if `brand.md` still has `<HEX>` placeholders).
- Key given: set `ELEVENLABS_API_KEY=` in `.env` with a script that reads it from a variable; don't put it on a command line that gets printed.
- `git init` the workspace if it isn't a repo (the template `.gitignore` keeps `.env` and renders out).

## 4. Check tools

```bash
bash "KIT/scripts/doctor.sh" "<WS>"
```

For each MISSING line, say in plain words what's missing and ask once: "Install these now?" On yes, run the fixes yourself (Homebrew on Mac, winget on Windows).

- Node missing: send them to nodejs.org to run the LTS installer (it needs their admin password), then re-run doctor.
- Homebrew missing on a Mac: its installer needs an admin password typed into a terminal, which the desktop app can't do. Install what you can without it: `python3 -m pip install --user yt-dlp`, and the HyperFrames step below. List FFmpeg as "optional for now" with the one-time fix: open the Terminal app, paste the line from brew.sh, then `brew install ffmpeg`.

## 5. HyperFrames (always)

Install its skills from npm. Don't add the `heygen-com/hyperframes` marketplace: that clones a ~500 MB repo and times out in the desktop app.

```bash
npx -y hyperframes skills
npx -y hyperframes --version
```

This puts the `hyperframes` skills in `~/.claude/skills/`, which the CLI and the desktop app's Code tab both load. If `npx -y hyperframes skills check` says they're already installed (or the HyperFrames plugin is), run `npx -y hyperframes skills update` and move on. Tell them the skills load in the **next** session.

## 6. Google Flow (only if they chose it)

google-flow-mcp (https://github.com/Manjot-logiciel/google-flow-mcp) drives Google Flow in its own Chrome window, using their own Google account and Flow's daily free credits.

First check for an existing Flow MCP: a `flow` entry in `<WS>/.mcp.json` or `~/.claude.json`, or `claude mcp get flow` if the `claude` command exists. If one is registered, leave it alone, tell them they already have Flow set up, and skip the rest of this step. Replacing it would drop their signed-in Chrome session.

```bash
[ -d ~/google-flow-mcp/.git ] || git clone https://github.com/Manjot-logiciel/google-flow-mcp.git ~/google-flow-mcp
cd ~/google-flow-mcp && git pull -q && npm install && npm run build
```

- Install it in the home folder. On a Mac, Desktop, Documents and Downloads are blocked for node (`EPERM`).
- Sign-in: start `cd ~/google-flow-mcp && npm run login` yourself as a background command (it keeps running while the window is open). Tell them: sign into Google in the Chrome window that opens, open or create a Flow project, leave the window open, then reply "done".
- Register it for this workspace by writing `<WS>/.mcp.json` (merge into the file if it exists). Use absolute paths:

```json
{ "mcpServers": { "flow": {
    "command": "node",
    "args": ["/Users/<them>/google-flow-mcp/dist/index.js"],
    "env": { "FLOW_MCP_OUTPUT": "<WS>/flow-out" } } } }
```

- It loads in the next session in this folder. Claude asks once whether to trust it: tell them to click Allow.

- Never copy or delete the Chrome profile it creates (`~/.flow-mcp/chrome-profile`); it holds their Google session.

## 7. Finish

Run `doctor.sh` again and show the summary line. Then tell them, in this shape:

- Workspace: `<WS>`
- Next time: open this folder in the Claude app's Code tab (or `cd <WS> && claude` in a terminal), as a new session so HyperFrames and Flow load
- To make a video: drop files into `inbox/`, write links and wishes in `inbox/notes.md`, then type `/video-studio:make-video <one line about the video>`
- Anything still MISSING, one line each with its fix.

Do not start a video in this session unless they ask.
