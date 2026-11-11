# Motion grammar

## Numbers

- **Entrances:** `expo.out`, 0.14-0.35 s. Tiny overshoot (`back.out(1.6-2.4)`) only on things that land: stamps, pins, checkmarks, the logo tile.
- **Exits:** `expo.in`, 0.12-0.22 s. Exits are faster than entrances.
- **Slam** (giant word): from scale 1.8-2.2 and opacity 0 to 1 in 0.14 s `expo.out`, then a slow 1.00 to 1.05 drift so it never freezes.
- **Kick** (camera hit): 4 frames of hard offsets, about `[a, -0.6a]`, `[-0.7a, 0.5a]`, `[0.4a, 0.3a]`, `[0, 0]`, with a = 8-22 px. Use it on every action word.
- **Flash:** paper overlay at 0.5-0.9 opacity for exactly 2 frames on big moments (the failure, the reveal, the impact).
- **Camera push:** the camera wrapper scales from 1.00 to 1.04-1.08 linearly across each scene. Reset at each scene start.
- **Subtitle words:** drop in from 36 px above with a 10 px blur trail, 0.18 s `expo.out`, starting 0.02 s before the spoken word. No zoom-pop.
- **Pace:** a new visual idea every 0.5-1 s in the first 10 s, at least once per bar after that.

## Transitions (pick a different one each time)

- **Whip:** outgoing scene `x: -2100, blur 24px` in 0.2 s `expo.in`; incoming from `x: 2100, blur 24px` to 0 in 0.3 s `expo.out`.
- **Wipe:** `clipPath: inset(100% 0 0 0)` to `inset(0)` in 0.2-0.25 s (from below for a lift-off, from the top for a drop).
- **Circle reveal:** `clipPath: circle(0% at 50% 50%)` to `circle(80%)` in 0.3 s, often right after a zoom-through.
- **Zoom-through:** scale the outgoing scene up to 9x in 0.28 s `expo.in` around one element, and reveal the next scene behind it.
- **Slam-over:** a giant word slams over a dimmed scene, then the next scene cuts in under it on the bar.
- **Tear / fall:** elements of the outgoing scene drop with gravity (`power2.in`, random rotation) while the next arrives.
- **Card shuffle:** the current card slides and shrinks to one side as a new card whips in on the other.

## Scene patterns that worked

- **Hook:** kicker words drop in one by one, then the giant claim slams over a rotating sunburst with ink sparkles. A UI card crashes in on the next word, and paper confetti bursts (90 seeded scraps flying out with `expo.out`, frozen mid-air when the mood turns).
- **The failure:** 2-frame flash, the scene goes grayscale, the chart line swaps to a flatline, the thread object greys and drops, a giant word cracks in two (two clip-path halves sliding apart).
- **Panic:** a wall of grey code bars scrolling fast, error windows slapping on every half beat with random tilt, then one giant word freezes the frame.
- **Time:** a tear-off calendar whose pages fly off faster and faster; a taped polaroid gets an ink tick stamp.
- **Loss:** a Gantt chart builds one bar per beat, then the bars fall and the month labels tear off on the loss word.
- **Scale:** a 17x17 grid of mini cards; zoom out in steps on the words (1, 3, 5, 9, 17 visible), then everything falls except one.
- **Reveal:** the thread object returns, hovers, and lands where the logo's accent goes; the logo assembles around it (tile spins in, letters drop in with a 0.035 s stagger).
- **Mess to order:** seeded scribble strands rotate as a knot, then interpolate point by point into straight lines, which become a code editor, which becomes a network the thread runs through.
- **Process words** (Map / Design / Build / Operate): one card transforms once per word (route, wireframe, solid blocks, live dashboard) while a giant word on the left changes with a different move each time (slide, flip, stretch, stamp) and a small "01 / 04" counter ticks.
- **Progress:** a track with stops; the thread hops stop to stop on the words, and each stop fills ink with a check.
- **Proof:** a count-up giant number, then logos as paper stickers slapping on at random angles every 0.085 s, then fanning into a neat grid.
- **CTA:** the last motion (rocket trail, route) curves round and draws to the logo's accent point; the logo builds; one CTA pill; the URL types on; the last second is completely still.

## HyperFrames gotchas (each one broke a render)

- Exactly one paused GSAP timeline registered at `window.__timelines["<composition-id>"]`, after it's fully built.
- Never set a CSS `transform` on an element you also tween with GSAP; centre with flex or margins.
- A `<video data-start>` must not sit inside another element with `data-start`. Wrap videos in an untimed `<div>` and animate the wrapper; give the halftone overlay its own timed `<div>` with the same window.
- Never tween `visibility`/`autoAlpha` on a `.clip` element; animate a child.
- Use a seeded random function (in motion.js). `Math.random` breaks frame-exact rendering.
- `fromTo` renders its start state immediately. A counter driven by `fromTo` + `onUpdate` can show its last value at frame 0; pass `immediateRender: false` and set the initial text explicitly at time 0.
- Stroke draw-ons: make `strokeDasharray` longer than the path, or part of the line shows before the draw starts.
- Only one root `index.html` with a composition id in the project folder; move backups elsewhere or the audio can play twice.
- Every `<audio>` needs an `id`, or the render is silent.

## QC before calling it done

- Snapshot every action word and every transition; read the contact sheet.
- No two readable texts at once; nothing readable before its word is spoken.
- The accent appears only on the thread object and the logo.
- Nothing holds still longer than a bar, except the last second.
- Counters and meters show the right value at frame 0.
- Text never collides with cards; long giant words fit the frame.
- Render a 30 fps draft for review, then 60 fps for delivery.
