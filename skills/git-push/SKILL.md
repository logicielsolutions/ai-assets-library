---
name: git-push
description: Use this skill when the user asks to "push the code", "commit and push", "push to GitHub", "ship this", "commit this", "create a commit", or any variation of committing and pushing code to GitHub. This skill reviews changes, scans for security issues, generates a commit message, confirms with the user, and pushes safely.
---

# git-push — Safe Commit & Push to GitHub

This skill is your intelligent git assistant. It reviews what you're about to push, checks for secrets and vulnerabilities, generates a meaningful commit message, and only pushes after your explicit approval.

## Workflow

### Step 1: Understand Current State

Run the following in parallel:
- `git status` — list all changed/untracked files
- `git diff HEAD` — see all staged and unstaged changes
- `git log --oneline -10` — understand the recent commit style for this repo
- `git branch --show-current` — confirm the active branch
- `git remote -v` — confirm the remote target

Summarize the changes to the user in plain English: what files changed, what kind of changes (new feature, bug fix, config update, etc.).

### Step 2: Security Scan

**Before staging anything**, scan all modified and untracked files for security issues using the `Grep` tool.

Check for these patterns across all changed files:

| What to scan | Pattern |
|---|---|
| AWS Access Keys | `AKIA[0-9A-Z]{16}` |
| OpenAI / Anthropic API keys | `sk-[a-zA-Z0-9]{20,}` |
| Private keys | `-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY` |
| Hardcoded passwords | `password\s*=\s*\S+` |
| Hardcoded tokens | `token\s*=\s*["'][^"']{8,}` |
| Generic secrets | `secret\s*=\s*["'][^"']{8,}` |
| `.env` files tracked | any file named `.env` in the changed file list |
| Large files | any file over 5MB (check with `ls -lh` on flagged files) |

**If any issue is found:**
- Stop immediately
- Report exactly what was found and in which file/line
- Do NOT proceed with staging or committing
- Ask the user to resolve the issue or explicitly confirm it's a false positive before continuing

**If scan is clean:**
- Report "Security scan: clean" and proceed

### Step 3: Generate Commit Message

Analyse the diff to understand the intent of the changes. Then:

1. Look at the recent commit messages (from Step 1) to match the style and tone of this repo
2. Draft a concise commit message:
   - First line: short summary (under 72 chars), imperative mood ("Add X", "Fix Y", "Update Z")
   - If needed, a blank line followed by 1-2 sentences of context
3. Present the draft to the user: "Proposed commit message: `[message]` — want to change it?"

### Step 4: Confirmation Summary

Before doing anything irreversible, show the user a full summary:

```
Files to be committed:
  [list of files]

Commit message:
  [proposed message]

Target: [branch] → origin

Security scan: [clean / ⚠ WARNING: describe issue]
```

Ask: "Ready to commit and push?"

Wait for explicit user approval (yes/go/ship/looks good). If the user wants any changes — to files, message, or scope — make them first.

### Step 5: Commit & Push

Once approved:

1. Stage specific files by name (never `git add -A` or `git add .` blindly):
   - Exclude any file flagged in the security scan unless the user explicitly cleared it
   - Exclude `.env`, `*.pem`, `*.key`, `*.p12` files always
2. Run `git add` for the specific files, then commit in a **separate command** (do NOT chain with `&&` into the push):
   ```
   git commit -m "$(cat <<'EOF'
   [commit message]
   EOF
   )"
   ```
3. Only after the commit succeeds, run `git push` as a **separate command**:
4. Confirm success with the commit hash and a link to the remote if available

## Important Notes

- **Never skip the security scan** — run it even if the changes look trivial
- **Never use `git add -A` or `git add .`** — always stage specific files by name
- **Never push without explicit user approval** — the confirmation in Step 4 is mandatory
- **Never amend published commits** — if a commit already exists on the remote, create a new one
- If the branch doesn't exist on remote yet, use `git push -u origin [branch]` (explicit) and note this to the user
- If there are merge conflicts or the branch is behind remote, stop and report — do not force push
- If there are no changes to commit (clean working tree), tell the user and stop
