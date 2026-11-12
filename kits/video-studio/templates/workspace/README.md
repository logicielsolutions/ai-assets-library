# Video studio

Your video workspace for Claude Code. Start every video session from this folder:

```
cd <this folder> && claude
```

## Make a video

1. Drop everything into `inbox/`: reference videos, screenshots, logos, footage, a script if you have one.
2. Paste links (Instagram, YouTube, Pinterest) into `inbox/notes.md`, or straight into the prompt.
3. Run:

```
/video-studio:make-video 30 sec product teaser, 16:9, calm and premium, like the refs
```

Then:

- **Check-in 1:** you get the plan: hook options, script, look, what will be generated. Edit it or say "go".
- **Check-in 2:** you get a draft MP4 in `projects/<name>/05_final/`. Reply with timecoded notes ("0:04 text too small"). Say "final" when it's right.

## What's in here

```
inbox/            drop zone, emptied into the project on every new video
brand/brand.md    colours, fonts, logo, tone; every video follows it
projects/
  _template/      copied for each new video
  handovers/      notes that let a new session pick up a video
.env              your keys (never commit it)
```

## Each project

```
00_brief.md       the ask, format, facts, every decision with its date
01_references/    links.md, images/, videos/, raw/ (your own footage)
02_script/        script.md, vo/ (voiceover lines + word timings)
03_assets/        generated images and clips, screenshots, music
04_build/         the HyperFrames project
05_final/         <name>-v1.mp4, v2 ... (never overwritten)
```

## Continue a video later

```
Read projects/handovers/<file>.md and continue. <what you want next>
```

## When something breaks

- Run `/video-studio:setup` again. It re-checks every tool and fixes what's missing.
- **Flow generation fails every time:** close the Agent panel in Flow's Chrome window.
- **A Flow job hangs:** usually a policy block. Run `/mcp` and reconnect `flow`.
- **Flow says signed out:** sign in again in the Chrome window it opens.
