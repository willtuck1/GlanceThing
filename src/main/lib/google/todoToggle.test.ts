import { describe, expect, it, vi } from 'vitest'

import { NotConnectedError, REVOKED } from './session.js'
import { parseToggle, toggleTask } from './todoToggle.js'

const task = { id: 't1', listId: 'L1', title: 'Send invoice', done: true }

describe('parseToggle', () => {
  it('accepts a full request', () => {
    expect(
      parseToggle({ reqId: 'r1', listId: 'L1', id: 't1', done: true })
    ).toEqual({ reqId: 'r1', listId: 'L1', id: 't1', done: true })
  })

  it('flags a request with bad fields so it can be rejected', () => {
    expect(parseToggle({ reqId: 'r1', listId: 'L1', id: 't1' })).toEqual({
      reqId: 'r1',
      invalid: true
    })
    expect(
      parseToggle({ reqId: 'r1', listId: '', id: 't1', done: false })
    ).toMatchObject({ invalid: true })
  })

  it('ignores a request without an id to answer', () => {
    expect(parseToggle({ listId: 'L1', id: 't1', done: true })).toBeNull()
    expect(parseToggle(null)).toBeNull()
  })
})

describe('toggleTask', () => {
  const req = { reqId: 'r1', listId: 'L1', id: 't1', done: true }

  it('acks with the updated task and refreshes the feed', async () => {
    const setDone = vi.fn(async () => task)
    const refetch = vi.fn()
    expect(await toggleTask(req, { setDone, refetch })).toEqual({
      reqId: 'r1',
      ok: true,
      task
    })
    expect(setDone).toHaveBeenCalledWith('L1', 't1', true)
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('acks with an error when Google rejects the change', async () => {
    const refetch = vi.fn()
    const ack = await toggleTask(req, {
      setDone: async () => {
        throw Object.assign(new Error('Request failed'), {
          response: { status: 503 }
        })
      },
      refetch
    })
    expect(ack).toEqual({
      reqId: 'r1',
      ok: false,
      error: 'Google is having problems (503). Retrying'
    })
    expect(refetch).not.toHaveBeenCalled()
  })

  it('refetches when the account is gone, so the tab can say so', async () => {
    const refetch = vi.fn()
    const ack = await toggleTask(req, {
      setDone: async () => {
        throw new NotConnectedError(REVOKED)
      },
      refetch
    })
    expect(ack).toEqual({ reqId: 'r1', ok: false, error: REVOKED })
    expect(refetch).toHaveBeenCalledOnce()
  })
})
