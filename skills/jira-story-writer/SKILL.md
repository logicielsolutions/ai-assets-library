---
name: jira-story-writer
description: Use when creating one or more Jira tickets for any task type — coding, research, review, planning, setup, or meeting.
---

# Jira Story Writer

Tickets are the **sole input** for AI agents running overnight. Every field must be self-contained — agents have zero conversation context when they read a ticket.

## Flow

1. Detect ticket type from user input → pick template below
2. Pull context in parallel: user-referenced file → your project index/overview → relevant meeting summary → your project's gotchas or decisions doc
3. If coding: explore repo to find exact file paths and existing patterns
4. If critical gap: ask ONE round, max 3 numbered questions — only if files are unknown OR acceptance criteria are genuinely ambiguous
5. Generate ticket body from the correct template
6. Create via `createJiraIssue` MCP (params at bottom)
7. If research: create Confluence page stub in your designated space → link to ticket

## Type → Label Mapping

| Type | Detected by | Labels to set |
|---|---|---|
| coding | implement / build / fix / add / refactor | `coding` + `<repo-label>` |
| research | spike / research / investigate / evaluate / explore | `research` + `<repo-label>` |
| setup | install / configure / deploy / infra / docker / aws | `setup` + `<repo-label>` |
| meeting | schedule / sync / call / invite / calendar / agenda | `meeting` |
| review / planning | review / watch / plan / propose / coordinate | `<repo-label>` |

**Repo label:** Set a label per repository or area of your project (e.g. `backend`, `frontend`, `infra`) so automated routines can filter tickets for the right repo.

**Never add a `no-routine` label** — that is a manual override only. This skill never touches it.

---

## Templates

### Coding / POC

```
**Goal:** [one sentence — what this builds or fixes]

**Context:**
[2–3 lines: why it's needed, what it connects to, what decision or feature it supports]

**Files:**
- `path/to/file.py` — [what to add or change here]
- `tests/test_file.py` — [what test to add]

**Follow:**
- [specific pattern name] — see `file.py:LXX`
- [convention from your context doc — e.g., fail-silent, non-blocking, max 40 lines]

**Avoid:**
- [explicit anti-pattern or out-of-scope boundary]

**Interface:**
```python
# Implement exactly this
def function_name(param: Type) -> ReturnType:
    """One-line docstring. Returns X on success, None on failure (never raises)."""
    ...
```

**Acceptance Criteria:**
- [ ] [observable, binary — QA agent verifies this from the PR diff]
- [ ] [observable, binary — QA agent verifies this from the PR diff]
- [ ] test `test_exact_name_here()` exists and passes

**Test Cases:**
- Happy: [input] → [expected output]
- Edge: [input] → [expected output]
- Error: [failure condition] → returns None, logs warning (never raises)

**Out of Scope:** [explicit — what NOT to touch, to prevent over-building]
**Priority:** [High | Medium | Low]
```

---

### Research Spike

```
**Goal:** [the specific question this research answers]

**Context:**
[1–2 lines: why, what decision this feeds, deadline if any]

**Questions:**
1. [specific]
2. [specific]

**Sources:**
- Context7: [library or tool name]
- Prior spike: [link to prior research doc if related work exists]
- [specific URL if known]

**Deliverable:**
Confluence page in <CONFLUENCE_SPACE> (parent: <PARENT_PAGE>)
Title: "[TICKET-XX] [Topic]"
Sections: Background | Findings | Trade-offs | Recommendation
Link completed page to this ticket.

**Done when:**
- [ ] Each research question answered in the Confluence page
- [ ] Recommendation stated with clear rationale
- [ ] Confluence page URL added to this ticket
**Priority:** [High | Medium | Low]
```

---

### Meeting / Setup

```
**Goal:** [what we're scheduling or setting up]

**Context:**
[1–2 lines: why, who is involved, deadline]

**Checklist:**
- [ ] Step 1
- [ ] Step 2

**Deliverable:** [calendar invite | runbook file | confirmed env variable | Slack message sent]

**Done when:**
- [ ] Deliverable created
- [ ] Stakeholders notified (if applicable)
**Priority:** [High | Medium | Low]
```

---

### Review / Planning / Proposal

```
**Goal:** [what we're producing or deciding from this work]

**Material / Context:**
[title + link if review; background and stakeholders if planning or proposal]

**Questions to Answer / Steps:**
1. [specific question or action step]
2. [specific question or action step]

**Deliverable:** [exact output — wiki file path | Confluence page title | proposal doc | action tickets]

**Done when:**
- [ ] Deliverable created at [exact location]
- [ ] Follow-up tickets created if action is needed (label: coding | research)
**Priority:** [High | Medium | Low]
```

---

## Jira MCP Call

```
createJiraIssue:
  cloudId: <JIRA_CLOUD_ID>
  projectKey: <PROJECT_KEY>
  issueType: Task
  summary: [concise title, max 80 chars]
  description: [ticket body from template above — verbatim]
  labels: [type label + repo label per mapping table]
  priority: High | Medium | Low
```

If linked issues were mentioned: add via `createIssueLink` after creation.

After creation: report the ticket ID and URL to the user.

## Confluence Stub (Research Tickets Only)

Run these steps immediately after creating the Jira ticket:

1. `getConfluenceSpaces` → find the space key for `<CONFLUENCE_SPACE>`
2. `getPagesInConfluenceSpace` → find the page ID for `<PARENT_PAGE>`
3. `createConfluencePage`:
   - title: `[TICKET-XX] [Topic]`
   - parent page: `<PARENT_PAGE>` page ID
   - body: pre-populate Background (from ticket Context) and Research Questions (from ticket Questions); leave Findings and Recommendation as `TBD — research agent will populate`
4. `editJiraIssue` → append the Confluence page URL to the ticket description under `**Deliverable:**`
