import type { AgentCard } from './types.ts'

export interface JumpState {
  /** Keys of waiting sessions that already had their jump. */
  jumped: string[]
}

export interface JumpInput {
  sessions: AgentCard[]
  /** Menu, update screen or a ringing timer is showing. */
  blocked: boolean
  tabVisible: boolean
}

export const initialJumpState: JumpState = { jumped: [] }

// One jump per waiting episode. A session that stops waiting is forgotten, so
// its next wait jumps again. While blocked or with the tab hidden nothing is
// consumed, so the jump fires once the way is clear.
export function nextJump(
  state: JumpState,
  input: JumpInput
): { state: JumpState; jumpKey: string | null } {
  const waiting = input.sessions.filter(s => s.state === 'waiting')
  const waitingKeys = waiting.map(s => s.key)
  const jumped = state.jumped.filter(k => waitingKeys.indexOf(k) !== -1)

  if (!input.tabVisible || input.blocked) {
    return { state: { jumped }, jumpKey: null }
  }

  const fresh = waiting.filter(s => jumped.indexOf(s.key) === -1)
  if (fresh.length === 0) return { state: { jumped }, jumpKey: null }

  let newest = fresh[0]
  for (const s of fresh) if (s.sinceMs > newest.sinceMs) newest = s
  return { state: { jumped: waitingKeys }, jumpKey: newest.key }
}
