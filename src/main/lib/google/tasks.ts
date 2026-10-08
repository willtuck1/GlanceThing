import { GetJson } from './calendar.js'
import {
  buildTaskItems,
  normalizeTask,
  normalizeTaskLists,
  normalizeTasks,
  RawTask,
  TaskListInfo
} from './tasksLogic.js'

import { Task } from '../feeds/types.js'

const API = 'https://tasks.googleapis.com/tasks/v1'
export const TASK_LISTS_URL = `${API}/users/@me/lists`
export const DEFAULT_LIST_URL = `${API}/users/@me/lists/@default`
// Google's alias for the user's default list, valid wherever a list id is.
export const DEFAULT_LIST = '@default'
const MAX_PAGES = 5

export type PatchJson = (url: string, body: unknown) => Promise<unknown>

function listPath(listId: string) {
  return listId === DEFAULT_LIST ? listId : encodeURIComponent(listId)
}

export function tasksUrl(listId: string) {
  return `${API}/lists/${listPath(listId)}/tasks`
}

export function taskUrl(listId: string, taskId: string) {
  return `${tasksUrl(listId)}/${encodeURIComponent(taskId)}`
}

function httpStatus(e: unknown) {
  return (e as { response?: { status?: number } })?.response?.status
}

async function getPages(
  get: GetJson,
  url: string,
  params: Record<string, string | number | boolean> = {}
) {
  const pages: unknown[] = []
  let pageToken: string | undefined

  for (let page = 0; page < MAX_PAGES; page++) {
    const json = await get(
      url,
      pageToken ? { ...params, pageToken } : params
    )
    pages.push(json)
    pageToken = (json as { nextPageToken?: string })?.nextPageToken
    if (!pageToken) break
  }

  return pages
}

export async function listTaskLists(
  get: GetJson
): Promise<TaskListInfo[]> {
  const pages = await getPages(get, TASK_LISTS_URL, { maxResults: 100 })
  return pages.flatMap(normalizeTaskLists)
}

export async function getDefaultListId(get: GetJson) {
  const json = (await get(DEFAULT_LIST_URL)) as { id?: unknown } | null
  return typeof json?.id === 'string' ? json.id : null
}

async function listTasks(
  get: GetJson,
  listId: string
): Promise<RawTask[]> {
  const pages = await getPages(get, tasksUrl(listId), {
    showCompleted: true,
    showHidden: true,
    maxResults: 100
  })
  return pages.flatMap(normalizeTasks)
}

export interface TasksFetcherDeps {
  get: GetJson
  getSelected: () => string | null
  now: () => number
}

// Returns a fetch function for the todo Feed: one list, the one picked in
// Settings or the user's default list.
export function createTasksFetcher(deps: TasksFetcherDeps) {
  return async (): Promise<Task[]> => {
    let listId = deps.getSelected() ?? DEFAULT_LIST
    let tasks: RawTask[]

    try {
      tasks = await listTasks(deps.get, listId)
    } catch (e) {
      // The picked list was deleted elsewhere; show the default one.
      if (listId === DEFAULT_LIST || httpStatus(e) !== 404) throw e
      listId = DEFAULT_LIST
      tasks = await listTasks(deps.get, listId)
    }

    return buildTaskItems(tasks, listId, deps.now())
  }
}

// Marks a task done or open on Google and returns it as the tab shows it.
// Reopening clears the completion time, as Google's own apps do.
export async function setTaskDone(
  patch: PatchJson,
  listId: string,
  taskId: string,
  done: boolean,
  now: number
): Promise<Task> {
  const body = done
    ? { status: 'completed' }
    : { status: 'needsAction', completed: null }
  const json = await patch(taskUrl(listId, taskId), body)
  const raw = normalizeTask(json as Parameters<typeof normalizeTask>[0])
  if (!raw) throw new Error('Google returned an unexpected task')
  return buildTaskItems([raw], listId, now)[0]
}
