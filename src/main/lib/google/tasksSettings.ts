import { getStorageValue, setStorageValue } from '../storage.js'
import { googleSession } from './auth.js'
import { googleGet } from './calendarSettings.js'
import { getDefaultListId, listTaskLists, PatchJson } from './tasks.js'
import { TaskListInfo } from './tasksLogic.js'

export const SELECTED_TASK_LIST_KEY = 'googleTaskList'

export interface TaskListOption extends TaskListInfo {
  isDefault: boolean
  selected: boolean
}

export const googlePatch: PatchJson = async (url, body) => {
  const res = await googleSession.http.patch(url, body)
  return res.data
}

// The saved list id, or null when the user never picked (default list).
export function getSelectedTaskList(): string | null {
  const value = getStorageValue(SELECTED_TASK_LIST_KEY)
  return typeof value === 'string' && value ? value : null
}

export function setSelectedTaskList(id: string) {
  setStorageValue(SELECTED_TASK_LIST_KEY, id || null)
}

export function clearSelectedTaskList() {
  setStorageValue(SELECTED_TASK_LIST_KEY, null)
}

// Lists for the Settings picker. The saved list is selected if it still
// exists, otherwise the default list, matching what the feed fetches.
export async function getTaskListOptions(): Promise<TaskListOption[]> {
  const [lists, defaultId] = await Promise.all([
    listTaskLists(googleGet),
    getDefaultListId(googleGet)
  ])
  const saved = getSelectedTaskList()
  const selected =
    saved && lists.some(l => l.id === saved) ? saved : defaultId
  return lists.map(l => ({
    ...l,
    isDefault: l.id === defaultId,
    selected: l.id === selected
  }))
}
