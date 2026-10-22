# context-bar

A Claude Code mod that keeps one line above the prompt: how full the context window is, and what Claude is working on right now. Open `/progress` for a pane with the full picture: the prompt, the task list, the plan and every tool step as it runs.

```
ctx ████████░░░░ 64% 128k/200k  │  plan ██████░░░░░░ 3/6 · Add the settings route
```

## Install

```
/plugin install context-bar --marketplace logicielsolutions/ai-assets-library
```

Answer `y` to add the marketplace, then pick a scope (user scope = every session).

## Use

| Command | What it does |
|---------|-------------|
| `/ctxbar` | Show or hide the bar above the prompt |
| `/progress` | Open the Progress pane: prompt, status, tasks with a time-left estimate, plan, live steps (subagents included) |

What the bar shows, after the context fill:

- **plan**: a superpowers plan (`docs/superpowers/plans/*.md`) or a plan-mode plan, with tasks done and the one underway. Before the first task it reads `not started`, or `pre-flight` once the plan is being carried out (executing-plans / subagent-driven-development loaded, or plan mode approved). It's picked up when Claude reads it, or by itself when one in the project was changed in the last two weeks and still has work left.
- **tasks**: the open task list (TodoWrite or TaskCreate/TaskUpdate) when there's no plan.
- **planning**: while brainstorming, writing a plan or in plan mode.
- **current step**: otherwise, the tool running now, the step count and the time taken.

Notes:

- The context bar turns yellow at 60% and red at 85%, where it suggests `/compact`.
- A task counts as done when its checkboxes are ticked, when its todo is completed, or when every file it says it creates exists. Progress is remembered across restarts.
- A finished plan drops off once a prompt doesn't touch it. `/clear` keeps the project's plan.
- On terminals narrower than 90 columns the bar stacks on two lines.

## Develop

```bash
claude --plugin-dir mods/context-bar     # run a session with it loaded
claude plugin validate mods/context-bar  # check manifest + hooks
claude plugin test mods/context-bar      # run tests/*.test.tsx
```
