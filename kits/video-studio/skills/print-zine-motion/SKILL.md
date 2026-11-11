---
name: print-zine-motion
description: Make snappy, dense motion-graphics videos (ads, launch films, explainers, reels) in a printed riso-zine look with HyperFrames - paper grain that boils on twos, two inks plus one accent, halftone duotone footage, giant kinetic type that slams on the spoken word, a paper subtitle strip, hard camera kicks, whip and wipe transitions, and one accent-coloured "thread" object that carries the story. Use this whenever someone wants a video built in code with HyperFrames (or asks for "that paper / riso / zine / printed / snappy motion" look), wants an ad or explainer synced to a voiceover and a song, or says their HyperFrames videos look basic, slow, centred or template-y and they want them to feel premium and fast.
---

# Print-zine motion

A way of building videos in HyperFrames that look like a hand-printed zine come to life: fast, dense, every hit landing on a spoken word. It works for any product or topic and any length from 10 to 90 seconds.

The look comes from a small set of rules applied everywhere, not from one effect. Read `references/look.md` (the visual system) and `references/motion.md` (the motion grammar) before designing anything. `assets/` has drop-in CSS, JS helpers and a working starter composition.

## Requirements

- HyperFrames (`npx hyperframes`, Node 22+, FFmpeg). Read the HyperFrames core skill or docs for the composition contract before writing composition HTML.
- Fonts: Satoshi (fontshare.com, free) and JetBrains Mono (free). Put the files in the project's `assets/fonts/`. Any heavy grotesk works if Satoshi isn't available.
- Footage is optional. Code alone carries the whole look. When footage helps (an object doing the story beat: a plug yanked, a rocket lifting off, a tower collapsing), use any source: your own clips, stock, or a video model. Always run it through `scripts/duotone.sh` so it prints in the same two inks.

## Workflow

Work in this order. Each step exists because skipping it caused a broken or flat video before.

1. **Lock the audio first.** Get the final voiceover and music mixed into one track before any animation. Everything is timed to it, so a later audio change means retiming.
2. **Get word timestamps.** If the voiceover came from `scripts/vo.py`, use its `_words.json`. Otherwise `npx hyperframes transcribe <track>` gives word-level times. Every subtitle word, giant word and key action lands on the frame its word is spoken. Measure, don't guess.
3. **Get the beat grid** if there's music: BPM and the time of the first downbeat. Cuts and scene changes go on beats and bars. Elements never pulse on the beat (that reads cheap); hits are single kicks that then hold steady.
4. **Plan scenes against the words.** One scene per spoken line or idea. For each, write: the visual metaphor, the word each action lands on, and how it transforms into the next scene. Pick one accent "thread" object (see look.md) and decide where it appears, disappears and pays off.
5. **Build the first 5-10 seconds only, render it, and get approval.** The hook decides whether the style works. It's much cheaper to change direction here than after 50 seconds are built.
6. **Build the rest**, scene by scene, using the helpers in `assets/motion.js`.
7. **Check with snapshots, then render.** `npx hyperframes snapshot --at <times>` at every action word and every transition, read the contact sheet, fix, repeat. Render a 30 fps draft to review, then the 60 fps final. See the QC list in motion.md.

## The non-negotiables

These are what make it look designed and fast instead of like a slideshow:

- **Only one readable text on screen at a time, and it's the spoken words.** Either a giant kinetic word filling the frame, or the paper subtitle strip at lower left. Never both. Background UI, code and charts use unreadable grey bars.
- **Something new every 0.5-1 s in the hook, at least once per bar after.** Nothing holds still longer than a bar except the final second.
- **Every scene transforms into the next.** Whip with blur, clip-path wipe, zoom-through, circle reveal, slam, tear. No plain fades.
- **Everything is printed.** Paper grain over the whole frame that boils on twos, a hard offset shadow on every card, halftone duotone on every photo or clip. Raw footage never shows.
- **Two inks plus one accent.** The accent belongs to the thread object only (and the logo). No accent text, no accent backgrounds, no glow.
- **The camera always moves.** Slow push between hits, a 4-frame kick on every hit.

## Writing the build prompt

If the user wants a prompt to paste into a fresh session, or wants to describe a video in detail first, fill in `references/prompt-template.md`. It's structured so the person only has to supply the product, the script and the audio; the look and motion sections are already written.

## Files

- `references/look.md` - palette, type, texture, layout, the thread object, the corner meter
- `references/motion.md` - easing and timing numbers, every transition recipe, scene patterns, HyperFrames gotchas, QC list
- `references/prompt-template.md` - fill-in build prompt plus a worked example
- `assets/style.css` - drop-in tokens, paper grain, cards, giant type, subtitle strip, halftone
- `assets/motion.js` - seeded random, grain boil, kick, flash, whip, slam, wipe, subtitle builder
- `assets/starter.html` - a working 8-second composition showing the whole system; copy it to a new project's `index.html` and edit
- `scripts/duotone.sh` - turns any clip into two-ink duotone matching the palette
