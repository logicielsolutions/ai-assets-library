# video-studio

Make videos with Claude Code. Drop references in a folder, run one command, get MP4 drafts you can review and refine.

You don't need to have attended the workshop. Follow the steps below in order.

## Before you start

- A Mac (Apple Silicon or Intel) or Windows 10/11.
- [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) installed and signed in. Check with `claude --version`.
- Optional: an [ElevenLabs](https://elevenlabs.io) API key for voiceover. The free tier is fine for tests. Commercial use needs a paid plan.
- Optional: Google Chrome and a Google account, for AI-generated images and clips through Google Flow.

Setup checks and installs everything else (Node 22+, FFmpeg, yt-dlp, Python 3, HyperFrames).

## 1. Install the plugin (once)

```bash
claude plugin marketplace add logicielsolutions/ai-assets-library
claude plugin install video-studio@ai-assets-library
```

## 2. Set up your workspace (once)

```bash
mkdir ~/video-studio && cd ~/video-studio && claude
```

In Claude, run:

```
/video-studio:setup
```

It asks four questions:

1. Your name
2. Brand: Logiciel preset, your own, or none
3. ElevenLabs key: paste now, add later, or no voiceover
4. Google Flow: set up now or skip

Then it creates the folders, writes `.env`, checks your tools (and offers to install missing ones), installs HyperFrames and, if you chose it, Google Flow.

When it finishes, **quit Claude and start it again** in the same folder so the HyperFrames plugin loads.

Re-run `/video-studio:setup` any time. It never overwrites your files.

## 3. Make a video

1. Drop references into `inbox/`: style videos, screenshots, logos, your footage, a script if you have one.
2. Write links and what you like about each in `inbox/notes.md`.
3. Run:

```
/video-studio:make-video 30 sec product teaser, 16:9, calm and premium, like the refs
```

What happens next:

- **Check-in 1, the plan:** format, three hook options, the script, the look, and anything that costs credits. Edit it or say "go". Nothing is generated before this.
- **Build:** voiceover, images, the HyperFrames edit, a quality pass.
- **Check-in 2, the draft:** `projects/<name>/05_final/<name>-v1.mp4`. Reply with timecoded notes ("0:04 text too small"). Each round makes a new version (v2, v3…). Say "final" when it's right.

To continue a video in a later session, ask Claude for a handover first. Next time:

```
Read projects/handovers/<file>.md and continue. <what you want next>
```

## Your workspace

```
inbox/            drop zone, emptied into the project when a video starts
brand/brand.md    colours, fonts, logo, tone; every video follows it
projects/
  _template/      copied for each new video
    00_brief.md     the ask, format, facts, decisions with dates
    01_references/  links.md, images/, videos/, raw/ (your footage)
    02_script/      script.md, vo/ (voiceover + word timings)
    03_assets/      generated images and clips, screenshots, music
    04_build/       the HyperFrames project
    05_final/       v1, v2 … MP4s (never overwritten)
  handovers/      notes that let a new session pick up a video
CLAUDE.md         house rules Claude follows in this folder
.env              your keys (git-ignored, never share it)
```

## What's in this kit

| Part | What it does |
|---|---|
| `/video-studio:setup` | Builds the workspace, `.env` and brand file; installs HyperFrames; optional Google Flow |
| `/video-studio:make-video` | Inbox → project folder → plan → voiceover → images → HyperFrames edit → checks → v1, v2… |
| `writing-flow-scene-prompts` | How to write Google Flow image and video prompts that keep hands, faces and identity right |
| `print-zine-motion` | A printed riso-zine look for HyperFrames: paper grain, two inks, kinetic type |
| `scripts/vo.py` | ElevenLabs voiceover plus the start time of every word, so scenes land on the voice |
| `scripts/doctor.sh` | Prints OK or MISSING for every tool and key |
| `templates/workspace/` | The folder layout, house rules and brand presets copied by setup |

## Tools it uses

| Tool | Job | Cost |
|---|---|---|
| [HyperFrames](https://github.com/heygen-com/hyperframes) | Turns HTML + animation into MP4. Renders every video locally | Free |
| [ElevenLabs](https://elevenlabs.io) | Voiceover (`eleven_v3`, default voice Matilda; change in `.env`) | Free tier / paid plan |
| [Google Flow](https://flow.google.com) via [flow-mcp](https://github.com/GTAI-1/flow-mcp) | Generated images (Nano Banana) and video clips (Veo) | Images free (50 credits/day), clips use credits. Claude asks before spending them |
| FFmpeg, yt-dlp | Cutting, mixing, downloading reference videos | Free |

## Troubleshooting

- **Something is missing or broken:** run `bash <plugin folder>/scripts/doctor.sh` or just re-run `/video-studio:setup`.
- **`/hyperframes` not found after setup:** restart Claude in the workspace.
- **A reference link won't download** (Instagram login wall): save the video yourself into `projects/<name>/01_references/videos/`.
- **Voiceover fails:** the error shows ElevenLabs' own reason (bad key, no credits left).
- **Every Flow generation fails:** close the Agent panel in Flow's Chrome window.
- **A Flow job hangs:** usually a content policy block. Run `/mcp` and reconnect `flow`.
- **Flow says signed out:** sign in again in the Chrome window it opens.
- **Mac, Flow says `EPERM: operation not permitted`:** flow-mcp must not live in Desktop, Documents or Downloads. Setup installs it in `~/flow-mcp`.

## Good to know

- Google Flow runs through flow-mcp, a third-party tool that drives Flow in its own Chrome window with your Google account. Setup installs a reviewed commit (`03da4b2`). Check your company's policy before using it with a work account.
- Music: use only tracks you hold the rights to, or let Claude generate a simple bed in code.
- Every name, number and claim on screen must come from you or your references. Claude won't invent them.
