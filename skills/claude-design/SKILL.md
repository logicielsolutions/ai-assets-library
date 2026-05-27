---
name: claude-design
description: Use when the user says "create a presentation", "make slides", "I need a slide deck", "create a deck for", "make a Claude Design prompt", or wants to present anything to an audience. Generates a complete, ready-to-paste prompt for claude.ai/design.
---

# Claude Design — Presentation Prompt Generator

This skill generates a complete, detailed prompt to paste into Claude Design (claude.ai/design).
The prompt is the deliverable — not the slides. Claude Design creates the slides.

---

## What Makes a Good Claude Design Prompt

The prompt that produced the best results had these ingredients:
- **Exact presenter context** — who you are, your role, your company
- **Exact audience profile** — level, what they already know, peer vs lecture tone
- **One precise core message** — what they must leave thinking
- **Visual style block** — specific colours, fonts, constraints
- **"What this is actually about"** — the real story, not the surface description
- **Actual content with real details** — real file names, real decisions, real data — no placeholders
- **Slide-by-slide structure** — explicit guidance for every slide, not just topics
- **Additional notes** — things Claude Design should NOT do, edge cases

The more specific and real the prompt, the better the output.

---

## Step 1 — Identify Presentation Type

From the user's message, classify the presentation:

| Type | Examples |
|------|---------|
| **workshop** | Internal 1:1, team session, capability demo |
| **client-pitch** | POC proposal, solution overview, scoping meeting |
| **internal-demo** | Showing a build to leadership or a stakeholder |
| **team-update** | Progress update, sprint review, status deck |
| **conference** | External talk, meetup, community session |

---

## Step 2 — Pull Context Automatically

Run these in parallel before asking the user anything:

1. Read your primary project context file (e.g. `CLAUDE.md`, `README.md`, or equivalent) — company context, role, folder structure
2. Read your project index or overview file (e.g. `wiki/index.md`, `docs/index.md`) — current projects, priorities, people
3. Based on the topic, identify and read the most relevant file:
   - Workshop topic → read the matching workshop or topic doc if it exists
   - Client/project → read the relevant project page
   - Meeting follow-up → read the most recent relevant meeting summary
   - Strategy/priority → read your current priorities doc
4. Read your decisions doc if decisions need to be referenced

---

## Step 3 — Ask Targeted Questions

Ask the user **maximum 4 questions**. Only ask what you cannot infer from the files.

Always ask:
1. **Who is the audience?** (role, Claude Code level if relevant, how well they know the topic)
2. **One core message** — what must they leave thinking? (offer 3-4 options based on the topic)

Ask if not clear from context:
3. **Live demo vs tease** — what do you want to show on screen vs just mention?
4. **Visual style** — default is minimal dark terminal aesthetic; confirm or change

Do NOT ask about things already in the files (company name, role, project details, etc.).

---

## Step 4 — Generate the Claude Design Prompt

Output a single, complete prompt block the user can copy-paste directly into claude.ai/design.

Follow this exact structure:

---

### PROMPT TEMPLATE

```
Create a [style]-themed presentation for a [duration]-minute [presentation-type] 
called "[title]".

---

## WHO IS PRESENTING

[Name] — [role] at [company].
[2-3 lines of relevant context about what they do and what this presentation is part of.]

---

## WHO IS WATCHING

[Audience description. Level. What they already know. Tone — peer vs lecture vs client.]

Key message they must leave with:
"[Exact one-sentence core message]"

---

## VISUAL STYLE

- Background: [hex colour]
- Text: [colour]
- Accent: [hex colour] — [when to use]
- Font: [monospace for technical / clean sans-serif for prose]
- [Max words per bullet]
- [What NOT to use — stock photos, etc.]

---

## WHAT THIS PRESENTATION IS ACTUALLY ABOUT

[2-3 paragraphs. The real story — the angle, the philosophy, the system — 
not just the surface topic. This is what Claude Design uses to make 
design decisions, not just content decisions.]

---

## KEY CONTENT (use exactly — this is real, not generic)

[All the specific real content: actual file names, real decisions, real numbers, 
real quotes, real workflow steps. Pulled from the files read in Step 2.
Organised by topic, not by slide yet.]

---

## SLIDE STRUCTURE

[One section per slide. For each slide:]
### Slide N — [Name]
[Explicit instructions: what goes on this slide, exact text for headers, 
what diagram or visual to use, what NOT to include, the emotional beat of the slide.]

---

## ADDITIONAL NOTES FOR CLAUDE DESIGN

- [Things to preserve exactly — real file names, real commands]
- [Things to avoid — generic AI imagery, bullet walls, etc.]
- [Which slide is the climax — give it the most visual weight]
- [Tone reminders]
```

---

## Step 5 — Output

Print the complete prompt inside a code block so the user can copy it cleanly.

Then add one line:
> "Paste this into claude.ai/design. If it asks for clarification, tell it: 
> 'Use the exact details I gave you verbatim — real data, not placeholder text.'"

---

## Style Defaults (use unless user says otherwise)

| Setting | Default |
|---------|---------|
| Background | `#0d1117` (terminal black) |
| Text | white / `#e6edf3` |
| Accent | `#00ff88` (terminal green) — sparingly |
| Technical font | monospace |
| Prose font | clean sans-serif |
| Max words per bullet | 6 |
| Imagery | none — diagrams and flow charts only |
| Tone | peer-to-peer, practical, not salesy |

For client-pitch type: switch to `#ffffff` background, `<ACCENT_HEX>` (your brand accent colour),
professional sans-serif throughout.

---

## What Made the First Prompt Work (learn from this)

The workshop prompt for "How I Use Claude Code" worked because:
- It included the **actual folder tree** with real paths and annotations
- It described the **Karpathy wiki pattern** accurately, not generically  
- Each slide had **explicit content** — not "talk about X" but "show this exact snippet"
- It specified which slide was the **climax** (Slide 9 — the full picture diagram)
- It told Claude Design what **NOT to do** (no placeholder text, no generic AI imagery)
- The "what this is actually about" section explained the **philosophy** behind the content

Apply the same level of specificity for every presentation this skill generates.
