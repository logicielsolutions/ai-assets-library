---
name: setup
description: Set up a video workspace for making videos with Claude Code - folders, project template, brand file, .env with API key placeholders, HyperFrames, optional Google Flow. Use when someone runs /video-studio:setup, says "set up my video workspace", or when doctor.sh reports something missing. Safe to re-run; it never overwrites existing files.
---

# Video studio setup

Goal: the person ends with a working video workspace and knows the one command to make a video. They may never have used a terminal tool like this, so keep every message short and plain.

**Paths.** When this skill loads, the harness prints "Base directory for this skill: <dir>". The plugin root is two folders up from it (`<dir>/../..`). Call it `KIT` below and use the absolute path in every command.

## 1. Pick the folder

- Default: the current folder, if it is empty or already a video workspace (has `projects/_template/`).
- If the current folder is the home folder or has unrelated files, suggest `~/video-studio` and use it unless they name another.
- Mac: avoid `~/Desktop`, `~/Downloads` and iCloud folders for the Flow install (macOS blocks node there). The workspace itself is fine anywhere.

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

For each MISSING line, show the install command it prints and ask once: "Install these now?" On yes, run them (Homebrew on Mac, winget on Windows). If Homebrew itself is missing on a Mac, give them the one-line install from brew.sh to run with `!` and wait.

## 5. HyperFrames (always)

```bash
claude plugin marketplace add heygen-com/hyperframes
claude plugin install hyperframes@hyperframes
npx -y hyperframes --version
```

Tell them the plugin loads in the **next** Claude session.

## 6. Google Flow (only if they chose it)

flow-mcp drives Google Flow in its own Chrome window, using their own Google account and Flow's daily free credits. It is a third-party repo, so install the reviewed commit only.

```bash
[ -d ~/flow-mcp/.git ] || git clone https://github.com/GTAI-1/flow-mcp.git ~/flow-mcp
cd ~/flow-mcp && git fetch -q origin && git checkout -q 03da4b2 && npm install && npm run build
```

- Sign-in: ask them to run `! cd ~/flow-mcp && npm run login`, sign into Google in the window that opens, open or create a Flow project and leave the window open.
- Register it for every session:

```bash
claude mcp add --scope user flow -e FLOW_MCP_OUTPUT="<WS>/flow-out" -- node "$HOME/flow-mcp/dist/index.js"
```

- Never copy or delete the Chrome profile flow-mcp creates; it holds their Google session.

## 7. Finish

Run `doctor.sh` again and show the summary line. Then tell them, in this shape:

- Workspace: `<WS>`
- Next time: `cd <WS> && claude`
- To make a video: drop files into `inbox/`, write links and wishes in `inbox/notes.md`, then run `/video-studio:make-video <one line about the video>`
- Anything still MISSING, one line each with its fix.

Do not start a video in this session unless they ask.
