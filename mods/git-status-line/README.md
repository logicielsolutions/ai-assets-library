# git-status-line

A Claude Code mod that shows the current git branch and the number of changed files in the status line, e.g. `⎇ main · 3 changed`. It refreshes when the session starts and after every turn, and clears itself outside a git repo.

## Install

```
/plugin install git-status-line --marketplace logicielsolutions/ai-assets-library
```

Answer `y` to add the marketplace, then pick a scope (user scope = every session).

## Develop

```bash
claude --plugin-dir mods/git-status-line     # run a session with it loaded
claude plugin validate mods/git-status-line  # check manifest + hooks
claude plugin test mods/git-status-line      # run hooks/register.test.ts
```
