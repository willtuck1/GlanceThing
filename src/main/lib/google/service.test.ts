import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as string[])
const status = vi.hoisted(() => ({ connected: true }))

vi.mock('../utils.js', () => ({ log: () => {}, LogLevel: { WARN: 2 } }))
vi.mock('../repo.js', () => ({
  getSetupGuideUrl: () => 'https://github.com/a/b/blob/main/docs/SETUP.md'
}))
vi.mock('./auth.js', () => ({
  connectGoogle: async () => calls.push('connect'),
  disconnectGoogle: async () => {
    calls.push('revoke')
    status.connected = false
  },
  getGoogleStatus: () => ({ ...status }),
  setGoogleClient: () => {
    status.connected = false
  }
}))
vi.mock('./calendarSettings.js', () => ({
  clearSelectedCalendars: () => calls.push('clear calendars'),
  getCalendarOptions: async () => [],
  setSelectedCalendars: () => {}
}))
vi.mock('./tasksSettings.js', () => ({
  clearSelectedTaskList: () => calls.push('clear task list'),
  getTaskListOptions: async () => [{ id: 'L1', selected: true }],
  setSelectedTaskList: (id: string) => calls.push(`select ${id}`)
}))
vi.mock('../feeds/registry.js', () => ({
  getFeed: (key: string) => ({
    reset: () => calls.push(`reset ${key}`),
    refresh: async () => {
      calls.push(`refresh ${key}`)
    }
  })
}))

const service = await import('./service.js')

beforeEach(() => {
  calls.length = 0
  status.connected = true
})

describe('disconnect', () => {
  it('revokes, then clears selections and cached tasks and events', async () => {
    await service.disconnect()
    expect(calls).toEqual([
      'revoke',
      'clear calendars',
      'clear task list',
      'reset calendar',
      'refresh calendar',
      'reset todo',
      'refresh todo'
    ])
  })
})

describe('saveGoogleClient', () => {
  it('forgets the account when changing the client disconnects it', () => {
    service.saveGoogleClient('other', 'secret')
    expect(calls).toContain('reset todo')
    expect(calls).toContain('clear task list')
  })

  it('leaves feeds alone when nothing was connected', () => {
    status.connected = false
    service.saveGoogleClient('id', 'secret')
    expect(calls).toEqual([])
  })
})

describe('connect', () => {
  it('refreshes both Google feeds', async () => {
    expect(await service.connect()).toEqual({ ok: true })
    expect(calls).toEqual(['connect', 'refresh calendar', 'refresh todo'])
  })
})

describe('task lists', () => {
  it('returns the options', async () => {
    expect(await service.taskLists()).toEqual({
      ok: true,
      taskLists: [{ id: 'L1', selected: true }]
    })
  })

  it('saves a list and drops the old list from the cache', () => {
    service.saveTaskList('L2')
    expect(calls).toEqual(['select L2', 'reset todo', 'refresh todo'])
  })

  it('ignores a bad id', () => {
    service.saveTaskList(42)
    service.saveTaskList('')
    expect(calls).toEqual([])
  })
})

describe('googleStatus', () => {
  it('includes the setup guide link for the desktop app', () => {
    expect(service.googleStatus().setupGuideUrl).toBe(
      'https://github.com/a/b/blob/main/docs/SETUP.md'
    )
  })
})
