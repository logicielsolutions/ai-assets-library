---
name: make-video
description: Make a video from whatever is in the workspace inbox (reference videos, screenshots, footage, links, notes) plus a one-line ask - project folder, brief, script, voiceover, generated images, HyperFrames build and versioned MP4 drafts, with two check-ins. Use when someone runs /video-studio:make-video, says "make a video / reel / promo / explainer", or drops references and asks for a video. Needs a workspace from /video-studio:setup.
---

# Make a video

The person drops references, says what they want, and waits. You do the rest. Stop only at the two check-ins, or when something blocks you.

**Paths.** The harness prints "Base directory for this skill: <dir>" when this loads. The plugin root (`KIT`) is `<dir>/../..`. The workspace (`WS`) is the current folder; it has `CLAUDE.md`, `inbox/` and `projects/_template/`. If it doesn't, tell them to run `/video-studio:setup` and stop.

## 1. Intake (no questions yet)

- Read: the prompt, `WS/inbox/notes.md`, every file in `WS/inbox/`, `WS/brand/brand.md`, `WS/CLAUDE.md`.
- Pick a short kebab slug. `cp -R WS/projects/_template WS/projects/<slug>`.
- Move (don't copy) inbox files into `01_references/`, except `inbox/README.md` and `inbox/notes.md`: images → `images/`, videos → `videos/`, their own footage → `raw/`. Copy `notes.md` content into `00_brief.md`, then reset `inbox/notes.md` from the template (`KIT/templates/workspace/inbox/notes.md`).
- Links into `01_references/links.md`, then save them:
  - Instagram / YouTube / TikTok / Pinterest video: `yt-dlp -o "01_references/videos/%(id)s.%(ext)s" <url>`. If one fails (login wall), mark it failed in `links.md`, tell them in one line to drop that file into `01_references/videos/`, keep going.
  - Pinterest image: fetch the page, take the `og:image` URL, download it.
- Look at every reference. For each video make a contact sheet (`ffmpeg -i v.mp4 -vf "fps=2,scale=320:-1,tile=6x4" sheet.jpg`) and read it. Note palette, type, pacing (cuts per second), transitions, where text goes.

## 2. Choose the HyperFrames workflow

| They gave | Workflow |
|---|---|
| Their own talking footage | `talking-head-recut` + `embedded-captions` |
| Existing footage to dress up | footage as base layer + `motion-graphics` overlays |
| No footage, a concept or explainer | `faceless-explainer` or `motion-graphics` |
| A product or launch | `product-launch-video` |
| A music track to cut to | `music-to-video` |
| Refs look like printed paper / riso / zine | add the `print-zine-motion` skill for the look |

Defaults when they didn't say: 16:9 1920×1080, 30 s, 30 fps, ElevenLabs voiceover if `.env` has a key, light background, follow `brand.md`.

## 3. Check-in 1: the plan (wait for them)

Send it as a short artifact page, or in chat if it fits in ~15 lines:
- Format, length, workflow (one line each)
- 3 hook options: the first 1.5 s, spoken line + on-screen text
- Script with rough timings: short spoken sentences, no filler
- The look in 3–4 bullets taken from their refs and brand
- What will be generated in Flow, and whether any Veo/Omni clips would cost credits

Nothing gets generated or built before they say "go".

## 4. Build

1. **Voiceover**: one take of the whole script reads most naturally on `eleven_v3`; add audio tags per beat (`[warmly]`, `[curious]`) if it sounds flat.
   ```bash
   python3 -I "KIT/scripts/vo.py" "<script text>" "WS/projects/<slug>/02_script/vo/vo_full"
   ```
   The `_words.json` timings drive every scene start. No key in `.env`: build without VO and say so.
2. **Images** (only if the `flow` MCP is connected): load `writing-flow-scene-prompts`. Short prompts (~25 words), batches of about 5 with `flow_agent_images`. Images are free. Veo/Omni clips only if approved at check-in 1. Save to `03_assets/`. No people from real photos unless they gave the photos.
   Without Flow, draw everything in code.
3. **Edit**: load `/hyperframes:hyperframes`, follow the chosen workflow inside `04_build/`. Put the voiceover and music in the composition. Music only if they own it, else generate a simple bed in code and duck it 12–16 dB under the voice. SFX: UI sounds only (clicks, soft whooshes, pops).
4. Log every decision with its date in `00_brief.md`.

## 5. QA before they see anything

- `npx hyperframes check` passes.
- Snapshot frames around every cut and every headline; check text is readable and nothing overlaps.
- Render `05_final/<slug>-v1.mp4`. Pull frames at full frame rate around every transition and look for flashes: an element visible in place for a frame, then snapping to its start pose. In GSAP, set the start pose and opacity in one `tl.set` at the reveal time; don't rely on `fromTo` with `immediateRender:false`.
- Listen: voice above music, nothing clipped.

## 6. Check-in 2: the draft

Send the path, `! open <path>` and three lines on what to look at. They reply with timecoded notes. Apply, re-check, render the next version (`-v2`, `-v3`…). Never overwrite a version. Repeat until they say final.

## Rules

- Every name, number or claim on screen comes from them, their refs or `brand.md`.
- Hook within 1.5 s; a new visual every 1–2 s unless the refs are slower.
- Don't post anywhere. Delivery is the MP4 in `05_final/`.
- When they ask for a handover, write `WS/projects/handovers/YYYY-MM-DD_<slug>.md` (see that folder's README for what goes in it).
