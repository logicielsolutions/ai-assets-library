# The look

A risograph zine that moves. Two inks on warm paper, one accent, heavy type, hard shadows, visible grain. Premium and a bit loud. It should never look like a SaaS template.

## Palette

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#FAF8F5` | background, card fill |
| `--sand` | `#E3D9C8` | second ink: sunburst rays, card bars, chart fills |
| `--sand2` | `#CFC2AB` | darker second ink: placeholder text bars, misregistration shadow on type |
| `--ink` | `#0F0F10` | type, outlines, hard shadows |
| `--char` | `#444545` | secondary ink, labels |
| `--accent` | `#A41E21` | the thread object and the logo only |

Swap `--accent` (and the ink pair if needed) for the brand. Keep the rule: one accent, used on one object.

## Type

- **Giant kinetic words:** Satoshi 900, 300-760 px, letter-spacing -0.035em, line-height 0.82, with a hard misregistration shadow `9px 7px 0 var(--sand2)`. They can fill the frame edge to edge or bleed off it.
- **Kicker words** above a giant word: Satoshi 700, about 96-130 px.
- **Subtitle strip:** Satoshi 700, 50 px, on a paper label with a 3 px ink border and a `9px 9px 0` ink shadow, lower left (left 70, bottom 74), tilted -1 degree. The key word in each line gets a thick ink underline.
- **Tiny labels** (axis months, stop names, the meter): JetBrains Mono 500, caps, wide letter-spacing.

## Texture (always on, over everything)

- **Grain:** an SVG fractal-noise tile as a multiply overlay at 50%, stepped to a new offset every 2 frames. This "boil on twos" makes the whole frame feel hand-printed and alive even when nothing moves.
- **Fibres:** a stretched turbulence layer at 35% multiply.
- **Vignette:** a soft inset warm shadow.
- **Halftone:** a radial-dot pattern (7 px pitch) as a multiply layer over every photo and clip.
- **Footage:** always duotone (`scripts/duotone.sh` maps black to ink and white to paper). The film never shows raw footage.

## Surfaces

- **Cards** (app windows, calendars, photos, stickers): paper fill, 4-6 px ink border, 12-22 px radius, and a hard offset shadow `18px 18px 0 var(--ink)` (no blur). Window cards get a sand title bar with three outlined dots.
- **Backgrounds:** pick per scene from plain paper, a slowly rotating sand/paper sunburst (`repeating-conic-gradient`, 15 degree rays), a 60 px graph-paper grid, or a full-bleed duotone clip.
- **UI inside cards** is drawn in code: chat bubbles as rounded bars, code as indented bars, charts as thick ink polylines with a sand area fill. Readable copy never appears in UI.

## The thread object

Pick one small object in the accent colour that carries the story, the way a single red dot did in the original ad. It gives the viewer something to follow across scenes and turns the ending into a payoff.

- Introduce it in the hook doing its normal job (a live light on a demo).
- Take it away at the low point (it goes grey and falls off screen; the world is ink-only after that).
- Bring it back at the turn (it drops in and becomes part of the logo).
- Let it lead from then on: it draws routes, travels a progress track, runs through a network, lights the engine.
- End with it settled in the logo.

Keep it small (under 40 px) everywhere except inside the logo.

## The corner meter (optional)

A small mono label + big number in a paper box at top left, like a stamp on the page. It tells a tiny story of its own: for an ad about shipping, "HYPE" racing to 99%, crashing to "SHIPPED 0%" on the failure line, then climbing scene by scene to 100% on the call to action, where the accent dot appears beside it. Use it only if it can pay off; a corner device with no payoff is clutter.

## Layout

- Avoid centred-headline-plus-card layouts. Alternate: frame-filling type, a card off-centre with type on the opposite side, a full-bleed clip with the subtitle strip, a dense field of small elements.
- Fill the frame. Density is part of the look: confetti fields, walls of code bars, grids of hundreds of mini cards, stacks of stickers.
- No gradients, glassmorphism, lens flares, glows, stock icons, emoji or particle bursts.
