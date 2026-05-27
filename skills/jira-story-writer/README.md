# jira-story-writer

Creates self-contained, agent-ready Jira tickets for any task type: coding, research, setup, meeting, or review/planning.

Reads your project context files to fill in real file paths, decisions, and patterns — so tickets have enough context for an AI agent to execute them autonomously without any conversation history.

## How to use

```
/jira-story-writer
```

Then describe what you want to build or investigate: "Create a ticket to add bulk upload support to the ingestion API."

## Configure these placeholders

Open `SKILL.md` and replace the following before using:

| Placeholder | Where it appears | What to put |
|-------------|-----------------|-------------|
| `<JIRA_CLOUD_ID>` | Jira MCP Call section | Your Atlassian Cloud ID (UUID from your Jira URL or Atlassian admin) |
| `<PROJECT_KEY>` | Jira MCP Call section | Your Jira project key (e.g. `ENG`, `PROJ`, `AIT`) |
| `<CONFLUENCE_SPACE>` | Research template + Confluence Stub | The Confluence space name where research pages live |
| `<PARENT_PAGE>` | Research template + Confluence Stub | The parent page title under which research stubs are created |
| `<repo-label>` | Type → Label Mapping table | Your repo/area labels (e.g. `backend`, `frontend`, `infra`). Replace the description too to explain your labelling convention. |

Also review the **Flow → Step 2** file paths and update them to point at your actual project context files (index, meeting summaries, decisions doc, etc.).

## What stays generic

All four ticket templates (Coding/POC, Research Spike, Meeting/Setup, Review/Planning) are ready to use as-is — the structure and acceptance criteria patterns work for any software project.
