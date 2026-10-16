import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

const run = (exitCode: number, stdout: string) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

describe('git-status-line', () => {
  // Stands in for the engine: answers session.start and git, records each status line.
  const setup = (on: On, git: (argv: readonly string[]) => ReturnType<typeof run>) => {
    const lines: (string | undefined)[] = []
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('process.run', (_$, e) => git(e.argv))
    on('ui.status', (_$, e) => {
      lines.push(e.text)
      return { value: undefined }
    })
    return lines
  }

  test('shows branch and changed-file count', async ($, on) => {
    const lines = setup(on, argv => (argv.includes('rev-parse') ? run(0, 'feature/x\n') : run(0, ' M a.ts\n?? b.ts\n')))
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: true })
    expect(lines.at(-1)).toBe('⎇ feature/x · 2 changed')
  })

  test('shows branch alone when clean', async ($, on) => {
    const lines = setup(on, argv => (argv.includes('rev-parse') ? run(0, 'main\n') : run(0, '')))
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: true })
    expect(lines.at(-1)).toBe('⎇ main')
  })

  test('clears the line outside a git repo', async ($, on) => {
    const lines = setup(on, () => run(128, ''))
    await $.session.start({ cwd: '/tmp', surface: null, isInteractive: true })
    expect(lines).toEqual([undefined])
  })
})
