# Build prompt template

Paste this into Claude Code (with this skill installed), fill in the brackets, delete what you don't need. The look and motion sections are pre-filled; change them only if you want a different feel.

```
Create a [length] second [ad / launch film / explainer] for [product or brand], using HyperFrames and the print-zine-motion skill.

PRODUCT
- [What it is and who it's for, one line.]
- Promise: [the one thing the viewer should remember].
- Every name, number and claim comes from the script below. Don't invent stats.

AUDIO (locked)
- Use [path to the final mixed track] as the only audio. Don't trim or retime it.
- [Song BPM and first downbeat time, if known. Otherwise detect them.]
- Get word timestamps with `npx hyperframes transcribe`. Every subtitle word, giant word and key action lands on the frame its word is spoken.

SCRIPT (what the voice says)
[Paste the voiceover lines.]

STORY
- Thread object: [a small thing in the accent colour that follows the story, e.g. a red dot that starts as a live light, dies at the low point, returns at the reveal and ends in the logo].
- Scenes: [optional: your ideas per line. Otherwise: "you design the scenes, one strong visual metaphor per line".]
- Every scene transforms into the next. No plain fades.
- End on [logo + one CTA + URL]. The last second is completely still.

FORMAT
- [1920x1080 16:9 or 1080x1920 9:16], 60 fps, exactly the length of the audio, MP4.

LOOK (from the skill)
- Printed riso zine: paper #FAF8F5, sand #E3D9C8, ink #0F0F10, one accent [#hex] on the thread object and logo only.
- Satoshi 900 giant words, Satoshi 700 subtitle strip, JetBrains Mono labels.
- Paper grain boiling on twos, hard offset shadows on every card, halftone duotone on any footage.
- Only one readable text at a time: the spoken words, either giant or in the subtitle strip.
- Avoid gradients, glass, glows, stock icons, emoji, centred-headline-plus-card layouts.

MOTION (from the skill)
- A new visual every 0.5-1 s in the first 10 s, at least once per bar after.
- expo.out entrances 0.14-0.35 s, faster exits, camera kick on every action word, slow camera push between hits.
- Cuts land on beats and bars. Nothing pulses on the beat.

FOOTAGE
- [None, all code.] or [These clips: paths. Run each through duotone.sh and offset it so its action lands on its word.]

PROCESS
- Build and render only the first 8-10 seconds first and show me before building the rest.
- Then build the rest, snapshot every action word and transition, fix what's off, and render a 30 fps draft, then the 60 fps final.
```

## Worked example (shortened)

```
Create a 50 second ad for an AI engineering studio, using HyperFrames and the print-zine-motion skill.

PRODUCT
- A senior team that takes AI products from demo to production.
- Promise: we ship what others only demo.

AUDIO (locked)
- assets/audio/mix.wav, 118 BPM, first downbeat at 4.896 s.

SCRIPT
Ever had an AI demo blow the whole room away... and then die before production?
You're like... wait. It worked yesterday!
It's not just a bad launch. It's months of roadmap, gone.
Because today, everyone can build a demo. Almost no one can ship one.
That's exactly where we come in.
...
So stop demoing. Start shipping.
Ready to ship? Book a thirty-minute call with us today.

STORY
- Thread object: a red dot. It's the LIVE light on the demo, goes grey and falls on "die",
  drops back in on "we", becomes the dot in the logo, hops sprint stops, and ends in the logo.
- Corner meter: HYPE climbs to 99%, crashes to SHIPPED 0% on "die", reaches 100% on "Start shipping".
```
