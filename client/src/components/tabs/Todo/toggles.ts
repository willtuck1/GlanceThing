import type { Task } from '../../../types/Feeds.ts'

// Optimistic task toggles. A row flips as soon as it is tapped and keeps
// the local value until the host answers:
// - pending: sent, no ack yet. Polls are ignored for this row.
// - acked:   Google accepted it. Kept until a poll agrees, so a push that
//            was already on its way can't flip the row back.
// A failed ack or a timeout rolls the row back to the host's value.

export const ACK_TIMEOUT_MS = 10_000

export interface Toggle {
  reqId: string
  done: boolean
  sentAt: number
  acked: boolean
}

// Keyed by task id.
export type Toggles = Record<string, Toggle>

export interface Ack {
  reqId?: unknown
  ok?: unknown
  error?: unknown
}

export function applyToggles(items: Task[], toggles: Toggles): Task[] {
  if (Object.keys(toggles).length === 0) return items
  return items.map(t =>
    toggles[t.id] && toggles[t.id].done !== t.done
      ? { ...t, done: toggles[t.id].done }
      : t
  )
}

export function isPending(toggles: Toggles, id: string) {
  return !!toggles[id] && !toggles[id].acked
}

export function startToggle(
  toggles: Toggles,
  task: Task,
  reqId: string,
  now: number
): Toggles {
  return {
    ...toggles,
    [task.id]: { reqId, done: !task.done, sentAt: now, acked: false }
  }
}

function without(toggles: Toggles, ids: string[]) {
  const next = { ...toggles }
  for (const id of ids) delete next[id]
  return next
}

export function receiveAck(
  toggles: Toggles,
  ack: Ack
): { toggles: Toggles; failed: { id: string; error: string } | null } {
  const id = Object.keys(toggles).find(k => toggles[k].reqId === ack.reqId)
  if (!id) return { toggles, failed: null }

  if (ack.ok === true)
    return {
      toggles: { ...toggles, [id]: { ...toggles[id], acked: true } },
      failed: null
    }

  return {
    toggles: without(toggles, [id]),
    failed: {
      id,
      error: typeof ack.error === 'string' && ack.error ? ack.error : ''
    }
  }
}

// A new poll arrived: drop acked toggles the host now agrees with, or
// whose task is gone. Pending toggles stay.
export function receiveItems(toggles: Toggles, items: Task[]): Toggles {
  const done = ids(toggles).filter(id => {
    if (!toggles[id].acked) return false
    const task = items.find(t => t.id === id)
    return !task || task.done === toggles[id].done
  })
  return done.length ? without(toggles, done) : toggles
}

// Pending toggles past the timeout fail; acked ones just give way to the
// host's value (e.g. someone changed the task again on the desktop).
export function expireToggles(
  toggles: Toggles,
  now: number,
  timeout = ACK_TIMEOUT_MS
): { toggles: Toggles; failed: string[] } {
  const expired = ids(toggles).filter(
    id => now - toggles[id].sentAt >= timeout
  )
  if (!expired.length) return { toggles, failed: [] }
  return {
    toggles: without(toggles, expired),
    failed: expired.filter(id => !toggles[id].acked)
  }
}

// Time until the next toggle expires, or null when there is none.
export function nextExpiry(
  toggles: Toggles,
  now: number,
  timeout = ACK_TIMEOUT_MS
) {
  const times = ids(toggles).map(id => toggles[id].sentAt + timeout - now)
  return times.length ? Math.max(0, Math.min(...times)) : null
}

function ids(toggles: Toggles) {
  return Object.keys(toggles)
}
