# owasp-top-10

OWASP Top 10:2025 security checklist for writing, reviewing, and testing code. Built so Claude applies it proactively — not only when explicitly asked for a "security review."

When this skill is active, Claude scans new code, reviewed code, and tests for the ten most common classes of application security failure (broken access control, injection, weak crypto, misconfigurations, supply-chain risks, and the rest) and surfaces findings with the OWASP category named explicitly.

## What this skill includes

- **`SKILL.md`** — the framework: mental model, top-priority red-flag table, per-phase workflow (writing / reviewing / testing / configuring infra).
- **`references/01-…10-*.md`** — one file per OWASP category, with code-level examples, vulnerable-vs-fixed snippets, and category-specific test cases.
- **`references/testing-checklist.md`** — canonical test cases per category.
- **`references/stack-*.md`** — three example stack-specific references (PHP+MySQL, Node+Mongo+React, AWS infra). They cover different surface areas, so they don't follow identical section structure — they're meant as inspiration for writing your own project's stack file, not strict templates.

## How to invoke

After copying the folder into your project's `.claude/skills/`, the skill activates automatically when you're writing code that touches auth, queries, file uploads, deserialization, crypto, dependencies, or infrastructure — there's no slash command. You can also force-trigger it by mentioning "OWASP", "security review", "pentest", "vuln", or "harden" in a request.

## Setup

No required configuration — drop the folder in and the skill activates. No placeholders, no env vars.

**Recommended:** add a `references/stack-<your-stack>.md` file that captures your project's specific language, framework, ORM, infra, and idioms. Use any of the included `stack-*.md` files as a template. Then add a one-line pointer in `SKILL.md` under "Stack-Specific Notes" so Claude knows to load it.

## Progressive disclosure

`SKILL.md` is short on purpose. The deep content lives in `references/` and is only read when relevant — Claude opens the category file when the current task falls in its area, the stack file when the work touches that stack, and the testing checklist when writing tests. Don't pre-load all references.

## Source

Based on the [OWASP Top 10:2025](https://owasp.org/www-project-top-ten/) project.

## Maintenance

OWASP updates the Top 10 every ~4 years (2017 → 2021 → 2025). When the list changes, update the category names and the red-flag table in `SKILL.md`. When a new attack class becomes common in the wild (prompt injection, model supply-chain attacks, etc.), add it to the relevant reference rather than waiting for the next OWASP cycle.

---

## Attribution

Adapted from the [OWASP Top 10:2025](https://owasp.org/www-project-top-ten/) project. Content derived from OWASP is licensed CC BY-SA 4.0.
