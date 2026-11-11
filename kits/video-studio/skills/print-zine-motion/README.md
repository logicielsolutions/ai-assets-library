# print-zine-motion

A Claude Code skill for making fast, dense motion-graphics videos in a printed riso-zine look, built with HyperFrames. Paper grain that boils, two inks plus one accent, giant words that slam on the spoken word, hard camera kicks, and a single accent-coloured object that carries the story.

No video generation service is required. Everything can be drawn in code. If you have footage (your own clips, stock, or any video model), the skill shows how to print it in the same two inks.

## Install

1. Install Claude Code, Node 22+ and FFmpeg.
2. Install HyperFrames: `npx hyperframes skills update` (or add the HyperFrames plugin), and check `npx hyperframes --version` works.
3. Install the `video-studio` plugin (see `kits/video-studio/README.md`), which includes this skill as `/video-studio:print-zine-motion`. Or copy this folder to `~/.claude/skills/print-zine-motion/` to use it on its own.
4. Download the fonts: Satoshi (fontshare.com/fonts/satoshi, free) and JetBrains Mono (jetbrains.com/lp/mono, free). Each video project needs them in its `assets/fonts/` as `Satoshi-Black.otf`, `Satoshi-Bold.otf`, `Satoshi-Medium.otf` and `JetBrainsMono-Medium.ttf`.

## Use it

Fastest way: open `references/prompt-template.md`, fill in the brackets (product, script, audio path), and paste it into Claude Code.

Or just ask: "Make a 30 second ad for my app with the print-zine-motion skill. Here's the voiceover: ..."

To see the system working first, watch `assets/starter-preview.mp4`. Opening `starter.html` straight in a browser only shows a still frame: HyperFrames compositions sit paused until the HyperFrames player or a render drives them. To play and edit it yourself:

```
npx hyperframes init my-video --example blank
cp <this skill folder>/assets/starter.html my-video/index.html
# put the fonts in my-video/assets/fonts/
cd my-video
npx hyperframes preview      # opens the player in your browser, press play, scrub the timeline
npx hyperframes render       # writes the MP4
```

## What makes it work

The look comes from a handful of rules applied everywhere. The four that matter most:

- Lock the audio first and time every word and hit to the voiceover's word timestamps.
- Only one readable text on screen at a time: the spoken words, either giant or in the subtitle strip.
- Something new every half second to one second in the opening, and every scene transforms into the next.
- Everything is printed: grain, hard shadows, halftone, two inks.

Build and render the first 8-10 seconds, check that you like it, then build the rest. It's much cheaper to change direction there.

## Files

- `SKILL.md`: the workflow Claude follows
- `references/look.md`: palette, type, texture, the thread object, the corner meter
- `references/motion.md`: timing numbers, transition recipes, scene patterns, HyperFrames gotchas, QC list
- `references/prompt-template.md`: fill-in prompt plus an example
- `assets/style.css`, `assets/motion.js`: drop-in styles and helpers
- `assets/starter.html`: a working 8 second example
- `scripts/duotone.sh`: prints any clip in the two inks
