---
name: writing-flow-scene-prompts
description: Use when writing image or video prompts for Google Flow (flow-mcp, Nano Banana, Veo, Omni), planning keyframes for a clip, putting a real person into a scene from reference photos, or batch-generating story scenes; also when Flow output has vague hands, wrong hair, drifting identity, or a policy block.
---

# Writing Flow Scene Prompts

## Overview
A Flow prompt describes **one frozen instant**, not an action in general. Models fill every gap with a guess: "takes the mask off" gives a random hand pose, "his hair" gives generic hair. Specify the body mechanics of that instant, anchor identity with real photos, and respect Flow's hard limits.

## Scene card (fill every slot, in this order)

```
Scene N: <title>
Beat: <one sentence: what happens in the story at this instant>
Refs (max 3): <asset:Character> + <full-body photo> + <scene/style frame>
Prompt:
 1. Shot: shot size, camera angle/height, lens feel ("same framing as the scene reference" when continuing a shot)
 2. Who: "the man/woman from the character reference" + "body build from the full-body reference" + hair TEXTURE and facial hair named in plain words (curly/coily/straight, goatee...)
 3. Body mechanics at THIS instant: see checklist
 4. Object/wardrobe state at this instant: where the prop is, how the fabric is deformed
 5. Secondary motion frozen mid-move: hair strands, cloth, dust, breath
 6. Environment: what must stay identical to the previous scene
 7. Light: direction, quality, colour
 8. Style: photoreal live-action still, lens, depth of field, grade, aspect
 9. Avoid: distorted hands, extra fingers, plastic skin, text, logos
```

## Body-mechanics checklist (slot 3)
For any hand/object interaction, name ALL of:
- **Which hand** (his left/right, and image-left/right if it's ambiguous) and **what the other hand is doing**
- **Path**: where the hand came from ("lifted from his knee")
- **Contact point**: exactly where the fingers are ("fingertips hooked under the mask's lower edge at the back of the jaw, thumb along the neck")
- **Grip and force**: pinch/hook/fist; pulling up/back; fabric stretching
- **Head and gaze**: tilt, chin direction, eyes
- **Weight/posture**: crouch, shoulders, balance

## Flow hard limits
| Fact | Consequence |
|---|---|
| Max 3 reference images per prompt | Spend them on: character, full-body, scene frame |
| `flow_agent_images` (batch Agent mode) takes NO references | Use it only for text-described characters; use `flow_generate type:image` when likeness matters |
| Video composer: first/last frames OR references, never both | Face identity in a frames clip comes ONLY from the frames, so get the end frame's face right first |
| Veo 3.1 clips are fixed at 8s; Omni 1.1 Flash does 4/6/8/10s | For 5-6s, use Omni at 6s (about 10 credits); for top quality, use Veo 8s and trim |
| An unmodified copyrighted frame (masked hero, movie still) gets policy-blocked | Every keyframe must visibly change the source: the person's face, a new action. Use the original still directly as the video's first frame instead of regenerating it |
| Brand/character names can trip filters | Describe instead: "red and blue spider-suit with black web lines" |

## Keyframes → video
1. Plan beats as **start / middle / end** frames. Images are free, video costs credits.
2. Video = first frame (source still) + last frame (approved keyframe). Describe the middle beat in the video prompt.
3. Video prompt recipe: `duration · one continuous shot · camera move` → **timed beats** ("0-1.5s: left hand rises from knee… 1.5-3.5s: fingers hook under the mask edge and peel it up over the nose… 3.5-6s: mask clears the head, curls spring loose and settle, he looks to camera") → physics cues (fabric drag, hair bounce and settle, a slight pause before each move) → "face matches the end frame, no morphing" → ambient sound.
4. State the credit total and get approval before queueing. Prices (Oct 2026; `flow_status` returns the current list): images 0 · Omni 1.1 Flash 7 (4s) / 12 (8s) · Veo 3.1 Lite 10 · Fast 20 · Quality 100 (8s fixed). The daily free allowance is 50.

## Batch wrapper (Agent mode, text-only characters)
Prefix the numbered scene cards with: *"Generate one unique 16:9 cinematic image for each scene prompt below, in one batch, strictly following each description and keeping character appearance, clothing, environment, palette, lighting and camera language consistent across scenes. Scene prompts:"* Repeat the full character description inside EVERY card, because Flow has no memory between scenes.

## Common mistakes
| Mistake | Result | Fix |
|---|---|---|
| "takes the mask off" | Mask rolled up, no hand in frame | Checklist: hand, contact point, grip |
| Relying on refs for hair | Generic straight hair | Name the texture in slot 2 as well |
| Regenerating the untouched source still | Policy block, and flow-mcp can hang | Use the source as first_frame |
| Asking Veo for 6s | Comes out at 8s anyway | Omni 6s, or Veo 8s + trim |
| Text-only description of the user | Likeness drifts | Real face + full-body photos as refs |

## Example (slot 3 + 5, mask half-off)
"His left hand has risen from his knee; fingertips are hooked under the mask's bottom edge at the back of his jaw, thumb pressed along his neck, peeling the fabric upward. The mask is bunched just above his nose, stretched and creased, exposing his mouth, mustache and goatee. His right arm still holds the shield up, unchanged. Chin slightly lowered, eyes hidden. Tight dark curls are springing out under the lifted edge at the temples."
