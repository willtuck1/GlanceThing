import { describe, expect, it } from 'vitest'

import {
  ACK_TIMEOUT_MS,
  applyToggles,
  expireToggles,
  isPending,
  nextExpiry,
  receiveAck,
  receiveItems,
  startToggle,
  Toggles
} from './toggles.ts'

import type { Task } from '@/types/Feeds.ts'

const open: Task = {
  id: 't1',
  listId: 'L',
  title: 'Send invoice',
  done: false
}
const other: Task = { id: 't2', listId: 'L', title: 'Milk', done: false }

function started(now = 0) {
  return startToggle({}, open, 'r1', now)
}

describe('startToggle', () => {
  it('flips the row at once and marks it pending', () => {
    const toggles = started()
    expect(applyToggles([open, other], toggles)).toEqual([
      { ...open, done: true },
      other
    ])
    expect(isPending(toggles, 't1')).toBe(true)
    expect(isPending(toggles, 't2')).toBe(false)
  })
})

describe('pending rows ignore polls', () => {
  it('keeps the local value while a poll still says open', () => {
    const toggles = receiveItems(started(), [open])
    expect(applyToggles([open], toggles)[0].done).toBe(true)
  })
})

describe('receiveAck', () => {
  it('keeps the value after ok until a poll agrees', () => {
    const { toggles, failed } = receiveAck(started(), {
      reqId: 'r1',
      ok: true
    })
    expect(failed).toBeNull()
    expect(isPending(toggles, 't1')).toBe(false)

    // A push that left the host before the PATCH: still shows done.
    const afterOld = receiveItems(toggles, [open])
    expect(applyToggles([open], afterOld)[0].done).toBe(true)

    // The refreshed push agrees: the toggle is dropped.
    expect(receiveItems(afterOld, [{ ...open, done: true }])).toEqual({})
  })

  it('rolls back and reports the error when not ok', () => {
    const { toggles, failed } = receiveAck(started(), {
      reqId: 'r1',
      ok: false,
      error: 'Connect Google in the desktop app'
    })
    expect(toggles).toEqual({})
    expect(applyToggles([open], toggles)[0].done).toBe(false)
    expect(failed).toEqual({
      id: 't1',
      error: 'Connect Google in the desktop app'
    })
  })

  it('ignores acks for unknown requests', () => {
    const toggles = started()
    expect(receiveAck(toggles, { reqId: 'other', ok: false })).toEqual({
      toggles,
      failed: null
    })
  })
})

describe('expireToggles', () => {
  it('rolls back a pending toggle after the timeout', () => {
    const toggles = started(1000)
    expect(
      expireToggles(toggles, 1000 + ACK_TIMEOUT_MS - 1).failed
    ).toEqual([])
    const result = expireToggles(toggles, 1000 + ACK_TIMEOUT_MS)
    expect(result).toEqual({ toggles: {}, failed: ['t1'] })
  })

  it('lets an acked toggle give way silently', () => {
    const acked = receiveAck(started(0), { reqId: 'r1', ok: true }).toggles
    expect(expireToggles(acked, ACK_TIMEOUT_MS)).toEqual({
      toggles: {},
      failed: []
    })
  })
})

describe('receiveItems', () => {
  it('drops an acked toggle whose task was deleted', () => {
    const acked = receiveAck(started(), { reqId: 'r1', ok: true }).toggles
    expect(receiveItems(acked, [other])).toEqual({})
  })

  it('returns the same object when nothing changes', () => {
    const toggles: Toggles = started()
    expect(receiveItems(toggles, [open])).toBe(toggles)
  })
})

describe('nextExpiry', () => {
  it('is the time left on the oldest toggle', () => {
    let toggles = started(0)
    toggles = startToggle(toggles, other, 'r2', 4000)
    expect(nextExpiry(toggles, 5000)).toBe(ACK_TIMEOUT_MS - 5000)
    expect(nextExpiry({}, 0)).toBeNull()
  })
})
