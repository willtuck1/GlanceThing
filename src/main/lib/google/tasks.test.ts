import { readFileSync } from 'fs'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { GetJson } from './calendar.js'
import {
  createTasksFetcher,
  DEFAULT_LIST,
  DEFAULT_LIST_URL,
  getDefaultListId,
  listTaskLists,
  PatchJson,
  setTaskDone,
  TASK_LISTS_URL,
  taskUrl,
  tasksUrl
} from './tasks.js'
import {
  buildTaskItems,
  dueLabel,
  MAX_COMPLETED,
  normalizeTaskLists,
  normalizeTasks,
  RawTask
} from './tasksLogic.js'

function fixture(name: string): unknown {
  const url = new URL(`./fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8'))
}

// Thu 8 Oct 2026, 14:00 in New York.
const NOW = Date.parse('2026-10-08T18:00:00Z')

vi.stubEnv('TZ', 'America/New_York')
afterAll(() => {
  vi.unstubAllEnvs()
})

function notFound() {
  return Object.assign(new Error('Request failed with status code 404'), {
    response: { status: 404 }
  })
}

describe('normalizeTaskLists', () => {
  it('reads ids and titles', () => {
    expect(normalizeTaskLists(fixture('tasklists.json'))).toEqual([
      { id: 'MDefaultListExample', name: 'My Tasks' },
      { id: 'MShoppingListExample', name: 'Shopping' }
    ])
  })

  it('returns nothing for malformed JSON', () => {
    expect(normalizeTaskLists(null)).toEqual([])
    expect(normalizeTaskLists({ items: [{ title: 'no id' }] })).toEqual([])
  })
})

describe('normalizeTasks', () => {
  const tasks = normalizeTasks(fixture('tasks-default.json'))

  it('drops deleted and blank tasks, keeps hidden completed ones', () => {
    const ids = tasks.map(t => t.id)
    expect(ids).not.toContain('taskDeleted')
    expect(ids).not.toContain('taskBlank')
    expect(ids).toContain('taskFlights')
  })

  it('reads the due date as a local calendar day', () => {
    const invoice = tasks.find(t => t.id === 'taskInvoice')!
    expect(new Date(invoice.due!).toISOString()).toBe(
      '2026-10-09T04:00:00.000Z'
    )
  })

  it('ignores items that are not tasks', () => {
    expect(normalizeTasks({ items: [null, 3, { title: 'x' }] })).toEqual(
      []
    )
    expect(normalizeTasks('nope')).toEqual([])
  })
})

describe('dueLabel', () => {
  const day = 24 * 60 * 60 * 1000
  const today = Date.parse('2026-10-08T04:00:00Z')

  it('labels upcoming and overdue dates', () => {
    expect(dueLabel({ due: today, done: false }, NOW)).toBe('Today')
    expect(dueLabel({ due: today + day, done: false }, NOW)).toBe(
      'Tomorrow'
    )
    expect(dueLabel({ due: today - 2 * day, done: false }, NOW)).toBe(
      'Overdue · Tue 6 Oct'
    )
  })

  it('does not call a completed task overdue', () => {
    expect(dueLabel({ due: today - 2 * day, done: true }, NOW)).toBe(
      'Tue 6 Oct'
    )
  })

  it('is empty without a due date', () => {
    expect(dueLabel({ due: null, done: false }, NOW)).toBeUndefined()
  })
})

describe('buildTaskItems', () => {
  it('orders open tasks like Google, subtasks under their parent, then newest completed', () => {
    const items = buildTaskItems(
      normalizeTasks(fixture('tasks-default.json')),
      'L1',
      NOW
    )
    expect(items.map(t => [t.title, t.done, t.dueLabel])).toEqual([
      ['Buy groceries', false, undefined],
      ['Bread', false, undefined],
      ['Milk', false, undefined],
      ['Send invoice', false, 'Tomorrow'],
      ['File taxes', false, 'Overdue · Tue 6 Oct'],
      ['Book flights', true, undefined],
      ['Renew passport', true, undefined]
    ])
    expect(items.every(t => t.listId === 'L1')).toBe(true)
    expect(items[0]).not.toHaveProperty('dueLabel')
  })

  it('shows a subtask at the top level when its parent is done', () => {
    const raw: RawTask[] = [
      {
        id: 'p',
        title: 'Parent',
        done: true,
        due: null,
        completedAt: 1,
        parent: null,
        position: '1'
      },
      {
        id: 'c',
        title: 'Child',
        done: false,
        due: null,
        completedAt: 0,
        parent: 'p',
        position: '0'
      },
      {
        id: 'o',
        title: 'Other',
        done: false,
        due: null,
        completedAt: 0,
        parent: null,
        position: '2'
      }
    ]
    expect(buildTaskItems(raw, 'L', NOW).map(t => t.id)).toEqual([
      'c',
      'o',
      'p'
    ])
  })

  it(`keeps only the newest ${MAX_COMPLETED} completed tasks`, () => {
    const raw: RawTask[] = Array.from({ length: 30 }, (_, i) => ({
      id: `d${i}`,
      title: `Done ${i}`,
      done: true,
      due: null,
      completedAt: i,
      parent: null,
      position: ''
    }))
    const items = buildTaskItems(raw, 'L', NOW)
    expect(items).toHaveLength(MAX_COMPLETED)
    expect(items[0].id).toBe('d29')
  })
})

describe('urls', () => {
  it('keeps the @default alias and encodes real ids', () => {
    expect(tasksUrl(DEFAULT_LIST)).toBe(
      'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks'
    )
    expect(taskUrl('a/b', 't 1')).toBe(
      'https://tasks.googleapis.com/tasks/v1/lists/a%2Fb/tasks/t%201'
    )
  })
})

describe('listTaskLists', () => {
  it('follows nextPageToken', async () => {
    const get = vi.fn<GetJson>(async (_url, params) =>
      params?.pageToken
        ? { items: [{ id: 'b', title: 'B' }] }
        : { items: [{ id: 'a', title: 'A' }], nextPageToken: 'p2' }
    )
    expect((await listTaskLists(get)).map(l => l.id)).toEqual(['a', 'b'])
    expect(get).toHaveBeenLastCalledWith(TASK_LISTS_URL, {
      maxResults: 100,
      pageToken: 'p2'
    })
  })
})

describe('getDefaultListId', () => {
  it('reads the id of the @default list', async () => {
    const get = vi.fn<GetJson>(async () => ({ id: 'MDefaultListExample' }))
    expect(await getDefaultListId(get)).toBe('MDefaultListExample')
    expect(get).toHaveBeenCalledWith(DEFAULT_LIST_URL)
  })
})

describe('createTasksFetcher', () => {
  function fetcher(get: GetJson, selected: string | null) {
    return createTasksFetcher({
      get,
      getSelected: () => selected,
      now: () => NOW
    })
  }

  it('fetches the default list with completed and hidden tasks', async () => {
    const get = vi.fn<GetJson>(async () => fixture('tasks-default.json'))
    const items = await fetcher(get, null)()

    expect(items).toHaveLength(7)
    expect(items[0].listId).toBe(DEFAULT_LIST)
    expect(get).toHaveBeenCalledWith(tasksUrl(DEFAULT_LIST), {
      showCompleted: true,
      showHidden: true,
      maxResults: 100
    })
  })

  it('fetches the list picked in Settings', async () => {
    const get = vi.fn<GetJson>(async () => ({ items: [] }))
    await fetcher(get, 'MShoppingListExample')()
    expect(get.mock.calls[0][0]).toBe(tasksUrl('MShoppingListExample'))
  })

  it('follows nextPageToken for tasks', async () => {
    const get = vi.fn<GetJson>(async (_url, params) =>
      params?.pageToken
        ? { items: [{ id: 'b', title: 'B', position: '1' }] }
        : {
            items: [{ id: 'a', title: 'A', position: '0' }],
            nextPageToken: 'n'
          }
    )
    expect((await fetcher(get, null)()).map(t => t.id)).toEqual(['a', 'b'])
  })

  it('falls back to the default list when the picked one is gone', async () => {
    const get = vi.fn<GetJson>(async url => {
      if (url === tasksUrl('gone')) throw notFound()
      return fixture('tasks-default.json')
    })
    const items = await fetcher(get, 'gone')()
    expect(items[0].listId).toBe(DEFAULT_LIST)
    expect(get).toHaveBeenLastCalledWith(
      tasksUrl(DEFAULT_LIST),
      expect.anything()
    )
  })

  it('fails on other errors so the feed keeps the last good list', async () => {
    const get = vi.fn<GetJson>(async () => {
      throw new Error('network down')
    })
    await expect(fetcher(get, 'L1')()).rejects.toThrow('network down')
    expect(get).toHaveBeenCalledTimes(1)
  })
})

describe('setTaskDone', () => {
  it('marks a task completed', async () => {
    const patch = vi.fn<PatchJson>(async () => ({
      id: 't1',
      title: 'Send invoice',
      status: 'completed',
      completed: '2026-10-08T18:00:00.000Z'
    }))
    const task = await setTaskDone(patch, 'L1', 't1', true, NOW)
    expect(patch).toHaveBeenCalledWith(taskUrl('L1', 't1'), {
      status: 'completed'
    })
    expect(task).toEqual({
      id: 't1',
      listId: 'L1',
      title: 'Send invoice',
      done: true
    })
  })

  it('reopens a task and clears its completion time', async () => {
    const patch = vi.fn<PatchJson>(async () => ({
      id: 't1',
      title: 'Send invoice',
      status: 'needsAction'
    }))
    const task = await setTaskDone(patch, 'L1', 't1', false, NOW)
    expect(patch.mock.calls[0][1]).toEqual({
      status: 'needsAction',
      completed: null
    })
    expect(task.done).toBe(false)
  })

  it('rejects when Google fails', async () => {
    const patch = vi.fn<PatchJson>(async () => {
      throw new Error('Request failed with status code 403')
    })
    await expect(
      setTaskDone(patch, 'L1', 't1', true, NOW)
    ).rejects.toThrow('403')
  })
})
