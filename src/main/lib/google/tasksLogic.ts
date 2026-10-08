import moment from 'moment'

import { Task } from '../feeds/types.js'
import { dayLabel } from './calendarLogic.js'

// Device ticks reach Google at once; this is how fast desktop edits show up.
export const TASKS_INTERVAL = 30 * 1000
// Google keeps every completed task, so only the newest are sent.
export const MAX_COMPLETED = 20

// Minimal view of the Tasks API JSON: only the fields we read.
interface GoogleTaskList {
  id?: string
  title?: string
}

interface GoogleTask {
  id?: string
  title?: string
  status?: string
  due?: string
  completed?: string
  deleted?: boolean
  parent?: string
  position?: string
}

export interface TaskListInfo {
  id: string
  name: string
}

// A task before host-side labels and ordering.
export interface RawTask {
  id: string
  title: string
  done: boolean
  // Local midnight of the due date, if any.
  due: number | null
  completedAt: number
  parent: string | null
  position: string
}

export function normalizeTaskLists(json: unknown): TaskListInfo[] {
  const items = (json as { items?: unknown })?.items
  if (!Array.isArray(items)) return []

  return (items as GoogleTaskList[])
    .filter(l => typeof l?.id === 'string' && l.id)
    .map(l => ({ id: l.id!, name: l.title?.trim() || 'Untitled list' }))
}

// Google stores the due date as midnight UTC and ignores the time, so the
// date part is a calendar day in the user's zone.
function parseDue(due: string | undefined) {
  if (typeof due !== 'string') return null
  const m = moment(due.slice(0, 10), 'YYYY-MM-DD', true)
  return m.isValid() ? m.valueOf() : null
}

export function normalizeTask(t: GoogleTask): RawTask | null {
  if (!t || typeof t.id !== 'string' || !t.id || t.deleted) return null
  const title = typeof t.title === 'string' ? t.title.trim() : ''
  // Blank tasks are drafts Google's own apps don't show either.
  if (!title) return null

  const completedAt = t.completed ? Date.parse(t.completed) : NaN
  return {
    id: t.id,
    title,
    done: t.status === 'completed',
    due: parseDue(t.due),
    completedAt: Number.isFinite(completedAt) ? completedAt : 0,
    parent: typeof t.parent === 'string' && t.parent ? t.parent : null,
    position: typeof t.position === 'string' ? t.position : ''
  }
}

export function normalizeTasks(json: unknown): RawTask[] {
  const items = (json as { items?: unknown })?.items
  if (!Array.isArray(items)) return []
  return (items as GoogleTask[])
    .map(normalizeTask)
    .filter((t): t is RawTask => t !== null)
}

export function dueLabel(
  task: Pick<RawTask, 'due' | 'done'>,
  now: number
) {
  if (task.due === null) return undefined
  const label = dayLabel(task.due, now)
  const overdue =
    !task.done && task.due < moment(now).startOf('day').valueOf()
  return overdue ? `Overdue · ${label}` : label
}

export function toTask(raw: RawTask, listId: string, now: number): Task {
  const due = dueLabel(raw, now)
  return {
    id: raw.id,
    listId,
    title: raw.title,
    done: raw.done,
    ...(due ? { dueLabel: due } : {})
  }
}

const byPosition = (a: RawTask, b: RawTask) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : 0

// Open tasks in Google's order (subtasks right after their parent), then
// the most recently completed tasks.
export function buildTaskItems(
  tasks: RawTask[],
  listId: string,
  now: number
): Task[] {
  const open = tasks.filter(t => !t.done)
  const openIds = new Set(open.map(t => t.id))
  const children = new Map<string, RawTask[]>()
  const roots: RawTask[] = []

  for (const t of open) {
    // A subtask whose parent is done or missing shows at the top level.
    if (t.parent && openIds.has(t.parent)) {
      const list = children.get(t.parent) ?? []
      list.push(t)
      children.set(t.parent, list)
    } else {
      roots.push(t)
    }
  }

  const ordered: RawTask[] = []
  for (const root of roots.sort(byPosition)) {
    ordered.push(root)
    ordered.push(...(children.get(root.id) ?? []).sort(byPosition))
  }

  const completed = tasks
    .filter(t => t.done)
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, MAX_COMPLETED)

  return ordered.concat(completed).map(t => toTask(t, listId, now))
}
