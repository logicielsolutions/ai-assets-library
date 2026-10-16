# The Claude Design hand-off

At the end of every run — Branch A or B — produce the text the user needs to turn `design-system/` into a design system inside Claude Design.

## Where design systems live now

Since September 2026, Claude Design runs inside Claude itself — any chat, the Artifacts tab, and Claude Code. A design system is saved as an artifact, and Claude checks every design it makes against that system and corrects drift before showing it. There are two ways in:

1. **Build it from a chat (default for this skill).** The user starts a chat in Claude, attaches the `design-system/` folder (plus any font files — see below), and pastes the **build message** you produce here. Claude builds the design system from those files. This path takes docs, tokens, logos, decks, screenshots and fonts, which is exactly what this skill outputs.
2. **`/design-sync` from Claude Code — only for a real component library.** It reads tokens and components straight from a buildable codebase, and "works best for product design systems in code." The `components/*.tsx` this skill generates are starters, not a built package, so don't send the user here for them. Mention it only on Branch B when the business already maintains its own component library in code — then the foundations, voice and non-negotiables from `design-system/` still belong in that sync's written conventions.

The old standalone app at claude.ai/design (with its "Set up your design system" onboarding form) closes on **December 14, 2026**. If the user is still on it before then, the same two text blocks below work there: the blurb goes in the company-blurb field, the notes in the notes field.

If you're running somewhere that can create Claude Design design systems directly, offer to do it now from the finished folder instead of handing off.

## The build message is two blocks

Produce two blocks of text and hand them back pasted together as one message:

1. **Company name and blurb** — up to ~80 words. Tells Claude what the business is and which surfaces the system must cover.
2. **Notes** — the non-negotiables, front-loaded so the generated system (and every design made from it) doesn't drift.

The user attaches the folder; you write the text. Real shipped assets in `assets/templates/` go up with the folder — Claude's own guidance is to "include real examples, not just specs," because a finished page says more about a brand's feel than a palette does.

---

## Block 1 — Company name and blurb

### Format

One flowing paragraph. Start with the brand name + colon. Include:
- What the business does, concretely (not "transforming" anything).
- For whom (specific audience).
- The list of surfaces this design system will need to cover.

### Rules

- Under 80 words.
- No hype vocabulary (remember the banned list from [non-negotiables.md](non-negotiables.md)).
- End with the surface list ("Surfaces we design for: marketing website, landing pages, blog, pitch decks, Instagram + LinkedIn carousels, email, infographics, ads.").
- Use the brand's voice — not a generic company-description voice. If the brand is warm, warm; if terse, terse.

### Template

```
{{BRAND_NAME}}: {{WHAT_IT_DOES}} for {{AUDIENCE}}. {{ONE_DIFFERENTIATING_LINE}}. Surfaces we design for: {{SURFACE_LIST}}.
```

### Example (from Lantern, the reference build)

> Lantern: AI services for US local businesses — salons, dental offices, auto shops, home services, restaurants, clinics, fitness studios. We set up AI inside the tools owners already use (phones, bookings, reviews) and stay on as the business changes. Surfaces we design for: marketing website, landing pages, blog, pitch decks, Instagram + LinkedIn carousels, email, infographics, ads.

---

## Block 2 — Notes

### Purpose

Claude reads every file in `design-system/` when it builds the system — but the *non-negotiables* that make the system feel like a system (and not just a folder of fragments) are easy for an LLM to skip over. Put them here, in the build message, so they sit at the top of Claude's context and consistently override defaults.

### Format

200–300 words. Start with "Load design-system/CLAUDE.md first" so Claude Design knows where to begin. Then bullet the brand-specific values (color, background, typeface) followed by voice rules, imagery direction, and motion rules. End with the one emotional line the brand is trying to produce in the reader.

### Template

```
Load design-system/CLAUDE.md first — it specifies the read order (BRAND-SUMMARY → voice → the right application file → tokens → components). Key non-negotiables that override any styling defaults:

• Primary color is exactly {{PRIMARY_HEX}}. Background is {{PAPER_HEX}} ({{PAPER_DESCRIPTION}} — never pure white for marketing). {{FONT_FAMILY}} is the only typeface at every size.
• Radii: {{RADIUS_RULE}}.
• No gradients, no glassmorphism, no glow, no 3D, no generic "AI"/industry visuals. Lucide icons only at 1.5 stroke.
• Voice: second-person singular, sentence case, short sentences. Name the user's world ({{USER_NOUNS}}) — never ours ({{OUR_NOUNS}}).
• Banned words on public surfaces: revolutionary, game-changing, 10x, cutting-edge, supercharge, unleash, leverage, transform, seamless, robust, "AI-powered" as a bare adjective.
• CTAs are soft and specific ("{{CTA_EXAMPLE}}") — never "{{CTA_ANTI_EXAMPLE}}" or anything with an exclamation mark.
• Imagery: real photography of {{IMAGERY_SUBJECT}}. Natural light. Never stock "{{STOCK_ANTI_EXAMPLE}}." Never AI-generated humans.
• Motion: minimal — fade + small translate (8px), 160/240/480ms. Never parallax, marquee-on-hero, or exit-intent popups.

Everything should make {{AUDIENCE_SHORTHAND}} feel {{DESIRED_FEELING}}, not sold to.
```

### Example (from Lantern, the reference build)

> Load design-system/CLAUDE.md first — it specifies the read order (BRAND-SUMMARY → voice → the right application file → tokens → components). Key non-negotiables that override any styling defaults:
>
> • Primary blue is exactly #2859D9. Background is warm off-white #FBFAF7 (never pure white for marketing). Inter is the only typeface at every size.
> • Radii: 10–16px on cards, pill (full) on marketing CTAs, md on product UI buttons.
> • No gradients, no glassmorphism, no glow, no 3D, no generic "AI" visuals (neural meshes, orbs, wireframe globes). Lucide icons only at 1.5 stroke.
> • Voice: second-person singular, sentence case, short sentences. Name the owner's world (chair, shop, appointment, phone, review) — never ours (agent, LLM, platform, pipeline).
> • Banned words on public surfaces: revolutionary, game-changing, 10x, cutting-edge, supercharge, unleash, leverage, transform, seamless, robust, "AI-powered" as a bare adjective.
> • CTAs are soft and specific ("See what we'd set up for you") — never "Book a Demo Now" or anything with an exclamation mark.
> • Imagery: real photography of actual local business owners at their workplace. Natural light. Never stock "diverse team around a laptop." Never AI-generated humans.
> • Motion: minimal — fade + small translate (8px), 160/240/480ms. Never parallax, marquee-on-hero, or exit-intent popups.
>
> Everything should make a local business owner feel understood, not sold to.

---

## A separate note on font files

Claude Design's guidance is to import "a complete design system that includes your styles, fonts, and components." A Google Font like Inter can be pulled in by name, but a licensed face (Söhne, GT Walsheim, Graphik, …) only renders correctly if its files go up with the folder.

When handing back, tell the user explicitly:

- **If the brand uses Inter** (or any Google Font): "Just attach `design-system/` — no font files needed."
- **If the brand uses a licensed display font**: "Attach the `.woff2`/`.otf` files for {{FONT_NAME}} along with `design-system/`, so Claude Design can render it instead of falling back to a substitute."

## The final delivery message

When you hand back, structure your reply like this:

````
Done. Here's what's in [project-root]/design-system/:

[Brief summary of what was produced, with a file count.]

[A caveat or two the user should know — e.g. "the logo uses a {{motif}}
motif; if you want alternatives I can generate 3–5 more directions."]

## Load it into Claude Design

1. Start a new chat in Claude.
2. Attach the `design-system/` folder. [Font-file line — "no font files
   needed" or "also attach the {{FONT_NAME}} files".]
3. Paste the message below and send it.
4. Check the design system Claude builds: colors, type and logo should match
   `tokens/` and `logo/`. Then ask it for one real asset (e.g. a landing-page
   hero) as a test. On a team plan, publish it so teammates design from the
   same system.

```
Build our design system from the attached design-system/ folder.

{{THE_GENERATED_BLURB}}

{{THE_GENERATED_NOTES}}
```

[Only if they're still on the standalone claude.ai/design before Dec 14, 2026:
the blurb paragraph goes in the company-blurb field, the rest in the notes field.]
````

Keep this structure — it's what the user expects, and the content of the two blocks is what worked in the reference build.
