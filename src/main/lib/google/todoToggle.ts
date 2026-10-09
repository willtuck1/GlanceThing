import { describeGoogleError } from './session.js'

import { Task } from '../feeds/types.js'

export interface ToggleRequest {
  reqId: string
  listId: string
  id: string
  done: boolean
}

export type ToggleAck =
  | { reqId: string; ok: true; task: Task }
  | { reqId: string; ok: false; error: string }

export interface ToggleDeps {
  setDone: (listId: string, id: string, done: boolean) => Promise<Task>
  // Re-reads the list and pushes it to every client.
  refetch: () => void
}

const isText = (v: unknown): v is string =>
  typeof v === 'string' && v !== ''

// Null when there is no request id to answer to.
export function parseToggle(
  data: unknown
): ToggleRequest | { reqId: string; invalid: true } | null {
  const d = (data ?? {}) as Record<string, unknown>
  if (!isText(d.reqId)) return null
  if (!isText(d.listId) || !isText(d.id) || typeof d.done !== 'boolean')
    return { reqId: d.reqId, invalid: true }
  return { reqId: d.reqId, listId: d.listId, id: d.id, done: d.done }
}

// Device tick: PATCH Google first, then ack. The client keeps the row
// flipped until the ack, and rolls it back if ok is false.
export async function toggleTask(
  req: ToggleRequest,
  deps: ToggleDeps
): Promise<ToggleAck> {
  try {
    const task = await deps.setDone(req.listId, req.id, req.done)
    deps.refetch()
    return { reqId: req.reqId, ok: true, task }
  } catch (e) {
    const { message, dropItems } = describeGoogleError(e)
    // The account is gone: refetch so the tab swaps its tasks for the
    // reconnect message.
    if (dropItems) deps.refetch()
    return { reqId: req.reqId, ok: false, error: message }
  }
}
