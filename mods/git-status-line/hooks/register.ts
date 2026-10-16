import type { EngineInterface, Register } from 'claude-code'

// Reads the branch and the count of changed files; clears the line outside a repo.
async function refresh($: EngineInterface) {
  const branch = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch.exitCode !== 0) return $.ui.status(undefined)

  const status = await $.process.run(['git', 'status', '--porcelain'])
  const changed = status.stdout.split('\n').filter(Boolean).length
  const name = branch.stdout.trim()

  $.ui.status(changed > 0 ? `⎇ ${name} · ${changed} changed` : `⎇ ${name}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await refresh($).catch(() => $.ui.status(undefined))
    return started
  })

  // Main loop only: subagent turns would refresh far more often than needed.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) await refresh($).catch(() => $.ui.status(undefined))
    return done
  })
}
