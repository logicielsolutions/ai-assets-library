import type { Step, TodoItem } from '../types'

// The input field that best says what a call is about, per tool
const DETAIL_FIELDS = ['description', 'skill', 'subject', 'file_path', 'pattern', 'query', 'url', 'command', 'prompt']

export function describeCall(input: Record<string, unknown>): string {
  for (const field of DETAIL_FIELDS) {
    const value = input[field]
    if (typeof value === 'string' && value.trim() !== '') {
      const text = value.trim().split('\n')[0]!
      // A path reads best as its last two segments
      return field === 'file_path' ? text.split('/').slice(-2).join('/') : text
    }
  }
  return ''
}

// How the work is being driven, from the tools the turn reached for
export function methodOf(tool: string, input: Record<string, unknown>): string | null {
  if (tool === 'Skill' && typeof input.skill === 'string') return input.skill
  if (tool === 'EnterPlanMode' || tool === 'ExitPlanMode') return 'plan mode'
  if (tool === 'Workflow') return 'workflow'
  return null
}

// Skills that make a plan, and skills that carry one out
const PLANNING_SKILL = /(^|:)(brainstorming|brainstorm|writing-plans|write-plan)$/
const EXECUTING_SKILL = /(^|:)(executing-plans|execute-plan|subagent-driven-development)$/
// Brainstorming's output, the design spec: writing one is planning, whenever the skill was loaded
const SPEC_FILE = /docs\/superpowers\/specs\/[^/]+\.md$/

// What a call does to the planning label: begin it, end it, or neither
export function planningChange(
  tool: string,
  input: Record<string, unknown>,
  isOk: boolean,
): { begin: string } | 'end' | null {
  if (!isOk) return null
  const skill = tool === 'Skill' && typeof input.skill === 'string' ? input.skill : null
  if (skill !== null && PLANNING_SKILL.test(skill)) return { begin: skill }
  if (skill !== null && EXECUTING_SKILL.test(skill)) return 'end'
  if ((tool === 'Write' || tool === 'Edit') && typeof input.file_path === 'string' && SPEC_FILE.test(input.file_path)) {
    return { begin: `spec: ${input.file_path.split('/').pop()!.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '')}` }
  }
  if (tool === 'EnterPlanMode') return { begin: 'plan mode' }
  // Plan mode's plan approved: what follows is the work
  if (tool === 'ExitPlanMode') return 'end'
  return null
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

// A rough time left: the pace so far, carried over what remains. Nothing
// until one item is done, since no pace exists before then.
export function estimateLeft(startedAt: number, now: number, done: number, total: number): number | null {
  if (done === 0 || done >= total) return null
  return ((now - startedAt) / done) * (total - done)
}

export function countDone(todos: readonly TodoItem[]): number {
  return todos.filter(t => t.status === 'completed').length
}

export function keepRecent(steps: readonly Step[], limit = 40): Step[] {
  return steps.slice(-limit)
}
