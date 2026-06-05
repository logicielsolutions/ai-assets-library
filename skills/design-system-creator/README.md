# design-system-creator

Produces a complete, portable **design system folder** for any brand — ready to upload to [Claude Design](https://claude.ai/design)'s "Set up your design system" flow, or to feed as context to any LLM that produces brand assets.

It handles two paths:

- **Branch A — Fresh:** building a brand from scratch (discovery interview → category research → synthesis → full system)
- **Branch B — Extract:** codifying the design system of a business you already run (website scrape, logos, fonts, shipped assets → reconcile → codify)

The output is a `design-system/` folder containing foundations docs (color, typography, voice, spacing, motion…), design tokens (JSON, CSS custom properties, Tailwind preset), logo SVGs + rendered rasters, React/Tailwind component starters, per-surface application guides (web, decks, Instagram, LinkedIn, email, ads), and the ready-to-paste Claude Design setup form text.

## How to use

```
/design-system-creator
```

Then describe your situation: "I'm starting a newsletter called Brackish, help me build a design system from scratch" or "Extract the design system from my company's website and assets."

The skill asks one clarifying question (new brand vs. existing brand) and walks the rest of the workflow with you.

## Dependencies

The skill checks these before doing anything (full diagnostic in `references/setup.md`) and will pause with install instructions if anything is missing:

| Tool | Used for | Install |
|------|----------|---------|
| **Firecrawl CLI** | Scraping reference sites / your own site for real brand tokens | `npx -y firecrawl-cli@latest init --all --browser` (needs a free API key — the init flow opens your browser to get one) |
| **extract-design-system** | Pulling CSS-computed tokens from an existing site (Branch B) | `npx extract-design-system <url>` (auto-installs) |
| **Playwright Chromium** | Rendering SVG logos and templates to JPG/PNG via `scripts/render.mjs` | `npm install playwright && npx playwright install chromium` |

No secrets are stored in the skill — the Firecrawl API key lives in your own local Firecrawl config.

## What's in the folder

```
design-system-creator/
├── SKILL.md                  — entry point: branch selection, asset-fidelity rules, non-negotiables
├── references/               — full playbooks (Branch A, Branch B, setup, output spec, form text)
├── scripts/render.mjs        — Playwright SVG → JPG/PNG renderer
├── assets/templates/         — token/logo/component/asset templates the skill fills in
└── evals/evals.json          — test prompts with expected outputs
```

## Things to know

- The skill refuses to invent brand values — it scrapes real data (Firecrawl + extract-design-system) and uses your real shipped assets as templates rather than recreating them synthetically.
- It enforces ten opinionated "non-negotiables" (one primary color, one typeface, sentence-case headlines, no hype vocabulary, minimal motion…) — see `references/non-negotiables.md` for the reasoning. It will push back if a choice violates them.
- On Branch A it waits for your explicit sign-off on color + typography + logo + name before generating anything.
