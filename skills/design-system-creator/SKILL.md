---
name: design-system-creator
description: Produces a complete, Claude-Design-compatible design system folder for any brand — ready to upload to Claude Design's "Set up your design system" flow and use across every future asset (websites, landing pages, pitch decks, Instagram/LinkedIn carousels, infographics, emails, ads). Handles two paths — building a brand from scratch (research → synthesis → full system) or extracting the design system from an existing business's shipped assets (website scrape, logos, fonts, past creatives). Use whenever the user wants to stand up a design system from zero, codify a brand they already run but never formalized, set up tokens/typography/color/voice guidelines, build reusable brand assets, or feed a brand kit into Claude Design / Claude Skills / any LLM-assisted asset-creation pipeline. Trigger even if the user says "brand kit," "brand guidelines," "style guide," "brand book," "design language," or "set up my brand for AI" — those are all in scope.
---

# Design System Creator

This skill produces a complete, portable **design system folder** — the kind a modern brand uses as the single source of truth for every asset it ever ships: web, landing pages, pitch decks, Instagram carousels, LinkedIn carousels, emails, infographics, ads, and everything else.

The final output is a folder that can be:

- uploaded directly to **Claude Design's "Set up your design system"** flow,
- fed as context to any LLM that produces brand assets,
- referenced by a design team as a living style guide.

## Step 0 — Prerequisite check (do this before anything else)

This skill is built on the assumption that extraction and research happen against **real scraped data**, not invented content. Before asking discovery questions or generating anything, verify the three tools this skill depends on are installed and working:

- **Firecrawl CLI** (`firecrawl search`, `firecrawl scrape --format markdown,branding --full-page-screenshot`) — required in both branches. Needs an API key.
- **extract-design-system** skill (`npx extract-design-system <url>`) — used in Branch B for independent CSS-computed tokens.
- **Playwright Chromium** — used by extract-design-system and by the bundled [scripts/render.mjs](scripts/render.mjs) to render SVG logos and templates to raster.

Run the diagnostic in [references/setup.md](references/setup.md) and react:

- **All three present?** Proceed.
- **Anything missing?** Pause, share the install command for that specific tool, and wait for the user to confirm. Full install instructions + fallback for offline users are in [references/setup.md](references/setup.md).

Do not silently skip a step if a tool is missing. Inventing color values or logo paths without scraping and rendering defeats the whole point of the skill.

## The first interview question

Once the tools are in place, ask the user exactly **one** question to figure out which path they're on:

> **Are we creating a brand-new design system from scratch, or are we extracting the design system from a business you already run?**

Don't branch, don't suggest, don't assume. Their answer picks one of two workflows:

- **"New / from scratch / nothing yet"** → Branch A. Load [references/branch-a-fresh.md](references/branch-a-fresh.md).
- **"Existing business / existing site / existing brand"** → Branch B. Load [references/branch-b-extract.md](references/branch-b-extract.md).

If the answer is ambiguous ("we have a logo but nothing else," "we've been running for a year but it's all ad-hoc"), they're almost certainly on Branch B — extraction — because you have real artifacts to work from. Confirm this with them before proceeding.

## What the skill produces (both branches, same structure)

Output a `design-system/` folder at the working-directory root, with this exact tree. The content differs by branch, but every file in the tree below gets produced:

```
design-system/
├── README.md
├── CLAUDE.md                       — load-order + non-negotiables for any LLM consuming this system
├── BRAND-SUMMARY.md                — one-page snapshot
├── foundations/
│   ├── brand.md
│   ├── voice.md
│   ├── vocabulary.md
│   ├── color.md
│   ├── typography.md
│   ├── spacing.md
│   ├── radius.md
│   ├── shadow.md
│   ├── motion.md
│   ├── iconography.md
│   └── imagery.md
├── tokens/
│   ├── tokens.json                 — W3C-ish schema
│   ├── tokens.css                  — CSS custom properties
│   └── tailwind.preset.js          — drop-in Tailwind preset
├── logo/
│   ├── mark.svg
│   ├── mark-inverse.svg
│   ├── wordmark.svg
│   ├── lockup-horizontal.svg
│   ├── lockup-stacked.svg
│   ├── favicon.svg
│   ├── [rendered .jpg / .png versions of the above]
│   └── usage.md
├── components/                     — React + Tailwind starters
│   ├── README.md
│   ├── utils.ts
│   ├── button.tsx
│   ├── input.tsx
│   ├── card.tsx
│   ├── feature-card.tsx
│   ├── badge.tsx
│   ├── nav.tsx
│   ├── hero.tsx
│   ├── testimonial.tsx
│   ├── cta-section.tsx
│   ├── stat.tsx
│   └── animated.tsx
├── voice/
│   ├── examples.md                 — do/don't pairs per surface
│   └── homepage-copy.md            — drop-in hero variants
├── applications/
│   ├── web.md
│   ├── presentations.md
│   ├── social-instagram.md
│   ├── social-linkedin.md
│   ├── email.md
│   ├── infographics.md
│   └── ads.md
└── assets/
    ├── patterns/                   — grid.svg, brand-wash.svg
    └── templates/                  — real shipped assets (preferred — copied from the user's working directory) and/or synthetic drafts (only where no real asset exists). On Branch B with shipped assets present, this folder is the user's actual decks / one-pagers / carousels / YouTube frames, organized by surface. The Marp theme CSS is always present (it's not a recreation — it's a CSS theme).
```

Full field-by-field content spec in [references/output-structure.md](references/output-structure.md).

## The asset-fidelity rules — read before either branch

These two rules apply on **both branches** and override the "produce every file" instinct. Real artifacts beat synthetic recreations every time.

### Rule 1 — When the user provides shipped assets, use them as templates. Do NOT recreate them.

If the user has handed you (or you've discovered in their working directory) any of: a one-pager PDF, a pitch deck, slide-template library, IG/LinkedIn carousels, ads, OG images, email screenshots, or any other shipped asset that demonstrates the brand's look — **copy those files into `design-system/assets/templates/` and reference them as the canonical templates.**

Do not write synthetic SVG recreations of carousel covers, OG images, LinkedIn posts, or any other surface for which the user already has a real version. A synthetic recreation will look "lazy" next to the real shipped artifact, and pasting it into a downstream tool (Claude Design, a designer's brief) will degrade the brand. The user's own assets are the highest-fidelity version of the brand that exists.

Concretely:
- **Browse the user's working directory before generating templates.** Look for `*.pdf`, `*.png`, `*.jpg` files at the project root, in subfolders that look organized (e.g., `slide-templates/`, `decks/`, `social/`, etc.), and in any folder the user mentioned in their prompt.
- **Copy real assets into `assets/templates/<surface>/` preserving structure.** E.g., a 28-template slide library lives in `assets/templates/deck-slides/<category>/<file>.png`.
- **Replace the asset-templates section of [output-structure.md](references/output-structure.md) with the real files** in your generated `README.md` for `assets/templates/`. Document which template to pick by content shape ("3 ideas equal weight → file X"), not by your made-up filename.
- **Only generate synthetic templates when no real asset exists for that surface, AND** explicitly flag each synthetic asset to the user with: *"I drafted this — let me know if it should be replaced with one of your real shipped versions."* On Branch A (fresh brand), every template is synthetic by definition; on Branch B, synthetic templates should be the exception, not the default.
- **Do not delete a real asset to make room for a synthetic one.** If the user provides a deck library *and* a YouTube intro slide, keep both. Templates are not deduplicated by surface — they're the user's canon.

### Rule 2 — When you render the logo, render it faithfully. Do NOT add features.

If the user provides a logo (file upload, website-scraped raster, or a clean reference photo of the asset in use), render an SVG that matches what's actually there. Don't add eye dots to a smiley that has none. Don't add a serif tail to a sans wordmark. Don't "improve" a 2-stroke mark by adding decorative elements. The brand owns the logo — the logo is what it is.

After producing logo SVGs, **diff your output against the source visually**: render the SVG with [scripts/render.mjs](scripts/render.mjs), open both side by side, and confirm every visible feature (and only those features) is present. If the source logo has lower resolution than you'd like, ask the user for a higher-res version — don't invent details to "clean it up."

If you're uncertain about a feature ("does this circle have eye dots or just a smile?"), zoom into the highest-resolution copy you can find and confirm before generating. When in doubt, render the simpler version and ask the user to confirm.

---

## The non-negotiables — enforced in every system you produce

These are the design laws. They are what make a system *feel* disciplined rather than generic. Apply them whether you're on Branch A or B. Full reasoning in [references/non-negotiables.md](references/non-negotiables.md); summary:

1. **One primary color.** Pick one confident hue. No "palette" of three competing primaries. Everything else is shades of ink (text) and semantic feedback colors.
2. **One typeface family.** Sans-serif. Ideally Inter (free, universal). A distinctive display face is allowed if licensed, but never two display faces. No script, no serif (serif is only allowed for very long-form legal/contract PDFs).
3. **One canvas choice.** Either warm off-white or pure white — pick one and use it consistently for marketing. Pure white feels clinical, warm off-white feels calm — choose based on the brand's personality, then commit.
4. **Sentence case for all headlines.** No Title Case. No ALL CAPS except in a ≤3-word overline.
5. **No hype vocabulary on public surfaces.** Banned everywhere: *revolutionary, game-changing, 10x, cutting-edge, supercharge, unleash, leverage, transform, synergy, seamless, robust, AI-powered (as a bare adjective).*
6. **Voice rules:** second-person singular ("you"), short sentences, name the user's world (their nouns: *chair, shop, appointment, chart, ticket*), not ours (*agent, LLM, platform, pipeline*).
7. **Imagery direction:** real photography of actual humans or spaces from the brand's context. No stock "diverse team around a laptop." No AI-generated humans. No generic "AI" visuals (glowing orbs, neural meshes, wireframe globes).
8. **Motion is minimal.** Fade + small translate. 160/240/480ms durations. No parallax, no looping hero video, no scroll-jacking, no confetti.
9. **No gradients-over-everything, no glassmorphism, no 3D, no neumorphism.** Calm, flat, confident.
10. **Every claim gets a number or a name.** "Saves time" is banned; "saves 4 hours a week" is required. Use real client names or acknowledge the data source.

If a design choice in either branch violates one of these, push back and propose the on-brand alternative.

## Branch A — Fresh: research → synthesis → generate

Full workflow in [references/branch-a-fresh.md](references/branch-a-fresh.md). Summary:

1. **Discovery interview** — one focused pass of questions covering: the business (what, for whom, why it exists), the feeling they want someone to have in 3 seconds, 3–7 reference sites they love and *specifically* what draws them to each, any anti-references, color instinct, and constraints (existing name, licensed font, channel-only).
2. **Research via Firecrawl.** Search the category if the user can't name enough references. Scrape every reference URL with `firecrawl scrape <url> --format markdown,branding --full-page-screenshot`. The `branding` format returns structured tokens (colors, fonts, typography, spacing, components, personality). Save each to `brands/<slug>/`.
3. **Synthesize.** Write a `research/synthesis-and-direction.md` doc: what the category looks like (color/type/radius patterns), where this brand should break from the pack, and a concrete proposed direction with specific hex values, type pair, spacing/radius choices, motion rules, imagery direction, and voice principles. End with **the five sign-off questions** (color, typography, logo direction, name confirmation, component scope).
4. **Wait for sign-off.** Do not start generating the design system until the user confirms color + typography + logo + name at minimum.
5. **Generate.** Produce every file in the tree above using the templates in [assets/templates/](assets/templates/) and the guidance in [references/output-structure.md](references/output-structure.md). Render the logo SVGs to JPG + PNG via the script at [scripts/render.mjs](scripts/render.mjs). Because this is a fresh brand, all asset templates are synthetic — flag each one to the user and ask if they want to replace any with their own version after the first round of real assets ships.
6. **Finalize.** Write the "Company name and blurb" + "Any other notes?" text for Claude Design per [references/claude-design-form.md](references/claude-design-form.md). Return the folder path + the form text to the user.

## Branch B — Extract: ingest → reconcile → codify

Full workflow in [references/branch-b-extract.md](references/branch-b-extract.md). Summary:

1. **Ingest interview.** Ask for: their public website URL (required); logo files (SVG preferred, any format accepted); fonts used (family names — actual font files optional); any shipped assets (pitch decks, IG/LinkedIn carousels, ads, proposals, email screenshots); their description of the business in 2 sentences; any "brand rules" they've been writing down informally.
2. **Scan the working directory for shipped assets.** Before scraping, `ls`/`find` the project root for PDFs, PNGs, JPGs, organized subfolders (`slide-templates/`, `decks/`, `social/`, `ads/`, etc.). Read a representative sample to confirm they're the brand's real artifacts. These become your `assets/templates/` payload — see Rule 1 in the asset-fidelity section above.
3. **Extract from the live site.** Run `firecrawl scrape <url> --format markdown,branding --full-page-screenshot --wait-for 5000` on the homepage plus 1–2 deeper pages (pricing, about). Run `npx extract-design-system <url>` for independent computed tokens. Save to `brands/<self-slug>/` and `.extract-design-system/`.
4. **Reconcile.** Compare what the scrapes found against what the user uploaded and what's in the working directory. Cross-check font names, primary colors, logo variants. Note any conflicts — the shipped asset usually wins over a stale website, but confirm with the user.
5. **Codify.** Generate every file in the tree above. Prefer extracted real values over invented ones. **Copy the user's real shipped assets into `assets/templates/<surface>/`** rather than recreating them as synthetic SVGs (Rule 1). When rendering the logo from the source artifact, render only what's there — no added eyes, no decorative additions (Rule 2). Where extraction is thin (voice, imagery direction, motion principles), interview the user briefly to fill the gap — *do not invent voice rules the brand doesn't already exhibit*.
6. **Finalize.** Same as Branch A — produce the Claude Design form text and hand it back. In the hand-off summary, list which templates are real (copied from the user's working dir) vs. synthetic (drafted by you and pending approval).

## Tools you have available

- **Firecrawl CLI** (`firecrawl search`, `firecrawl scrape --format markdown,branding --full-page-screenshot`) — already installed and authenticated in a typical Claude Code environment. Budget: one scrape per reference. Retry with `--wait-for 5000` for heavy marketing sites.
- **extract-design-system** (`npx extract-design-system <url>`) — Playwright-based CLI that pulls real CSS-computed tokens (colors, fonts, spacing). Requires Chromium (`npx playwright install chromium` if missing).
- **Playwright Node.js** — use the bundled [scripts/render.mjs](scripts/render.mjs) to render SVG logos + template SVGs to high-quality JPG + PNG. Install with `npm install playwright` if missing.
- **File tools** (Write, Edit, Read) — produce markdown and token files from the templates.

If any tool is missing, install it — don't silently skip that step. For instance, if Firecrawl is missing, tell the user and ask them to run `npx -y firecrawl-cli@latest init --all --browser` before you proceed.

## The final deliverable — always produce this

At the very end, regardless of branch, output two blocks of text the user can paste directly into Claude Design's setup form:

1. **Company name and blurb** — under 80 words. Name + what the business does + for whom + the list of asset surfaces it will ship.
2. **Any other notes?** — ~200–300 words. The most critical non-negotiables + specific visual/voice overrides that should bias Claude Design's output. Exact format in [references/claude-design-form.md](references/claude-design-form.md).

Do not skip this step. It is the hand-off and the whole point of producing the system in the first place.

## Where to go next

- **Prerequisite setup**: [references/setup.md](references/setup.md) — run the diagnostic first
- Branch A full playbook: [references/branch-a-fresh.md](references/branch-a-fresh.md)
- Branch B full playbook: [references/branch-b-extract.md](references/branch-b-extract.md)
- Output spec (what every file should contain): [references/output-structure.md](references/output-structure.md)
- Non-negotiables + reasoning: [references/non-negotiables.md](references/non-negotiables.md)
- Claude Design hand-off text: [references/claude-design-form.md](references/claude-design-form.md)
- Rendering script: [scripts/render.mjs](scripts/render.mjs)
- Templates (tokens, logo, components, applications, voice): [assets/templates/](assets/templates/)
