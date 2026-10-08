import { useContext, useEffect, useMemo, useRef, useState } from 'react'

import { SocketContext } from '@/contexts/SocketContext.tsx'
import { useFeed } from '@/hooks/useFeed.ts'
import { useListNav } from '@/hooks/useListNav.ts'

import ListRow from '@/components/ListRow/ListRow.tsx'
import StaleBadge from '@/components/StaleBadge/StaleBadge.tsx'

import {
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

import tabStyles from '../tab.module.css'
import styles from './Todo.module.css'

const ERROR_FLASH_MS = 3000

type Row = { kind: 'task'; task: Task } | { kind: 'completed' }

let reqCounter = 0
const newReqId = () => `${Date.now().toString(36)}-${++reqCounter}`

const Todo: React.FC<{ active: boolean }> = ({ active }) => {
  const { ready, socket } = useContext(SocketContext)
  const feed = useFeed<Task>('todo', active)
  const [toggles, setToggles] = useState<Toggles>({})
  const [failed, setFailed] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  const itemsRef = useRef(feed.items)
  itemsRef.current = feed.items

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashError = (ids: string[], error: string) => {
    const task = itemsRef.current.find(t => t.id === ids[0])
    const what = task ? `“${task.title}”` : 'task'
    setFailed(ids)
    setMessage(`Couldn't update ${what}${error ? `: ${error}` : ''}`)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => {
      setFailed([])
      setMessage(null)
    }, ERROR_FLASH_MS)
  }
  const flashRef = useRef(flashError)
  flashRef.current = flashError

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    },
    []
  )

  // A new poll: pending rows keep their local value, acked rows give way
  // once the host agrees.
  useEffect(() => {
    setToggles(t => receiveItems(t, feed.items))
  }, [feed.items])

  useEffect(() => {
    if (!ready || !socket) return

    const listener = (e: MessageEvent) => {
      const message = JSON.parse(e.data)
      if (message.type !== 'todo' || message.action !== 'ack') return
      setToggles(t => {
        const result = receiveAck(t, message.data ?? {})
        if (result.failed) {
          const { id, error } = result.failed
          // Outside the updater, which React may call twice.
          setTimeout(() => flashRef.current([id], error))
        }
        return result.toggles
      })
    }

    socket.addEventListener('message', listener)
    return () => socket.removeEventListener('message', listener)
  }, [ready, socket])

  // No ack in time: roll back.
  useEffect(() => {
    const wait = nextExpiry(toggles, Date.now())
    if (wait === null) return
    const timer = setTimeout(() => {
      const result = expireToggles(toggles, Date.now())
      setToggles(result.toggles)
      if (result.failed.length)
        flashRef.current(result.failed, 'No answer from the desktop app')
    }, wait)
    return () => clearTimeout(timer)
  }, [toggles])

  const toggle = (task: Task) => {
    if (isPending(toggles, task.id)) return
    if (!ready || !socket) {
      flashError([task.id], 'Not connected to the desktop app')
      return
    }
    const reqId = newReqId()
    setToggles(t => startToggle(t, task, reqId, Date.now()))
    socket.send(
      JSON.stringify({
        type: 'todo',
        action: 'toggle',
        data: { reqId, listId: task.listId, id: task.id, done: !task.done }
      })
    )
  }

  const items = useMemo(
    () => applyToggles(feed.items, toggles),
    [feed.items, toggles]
  )
  const openTasks = items.filter(t => !t.done)
  const doneTasks = items.filter(t => t.done)

  const rows: Row[] = openTasks.map(task => ({ kind: 'task', task }))
  if (doneTasks.length > 0) {
    rows.push({ kind: 'completed' })
    if (showCompleted)
      doneTasks.forEach(task => rows.push({ kind: 'task', task }))
  }

  const keys = rows.map(r =>
    r.kind === 'task' ? r.task.id : '#completed'
  )
  const activate = (row: Row | undefined) => {
    if (!row) return
    if (row.kind === 'completed') setShowCompleted(v => !v)
    else toggle(row.task)
  }
  const highlighted = useListNav(
    rows.length,
    active,
    i => activate(rows[i]),
    keys
  )

  return (
    <div className={tabStyles.tab} data-scroll-container>
      <StaleBadge stale={feed.stale} label={feed.fetchedAtLabel} />
      {message && <div className={styles.message}>{message}</div>}
      {feed.loaded && items.length === 0 && (
        // The host's error says what to do, e.g. "Connect Google in the
        // desktop app".
        <div className={tabStyles.empty}>{feed.error ?? 'All done'}</div>
      )}
      {feed.loaded && items.length > 0 && openTasks.length === 0 && (
        <div className={tabStyles.heading}>All done</div>
      )}
      {rows.map((row, i) => {
        const isHighlighted = active && i === highlighted
        if (row.kind === 'completed')
          return (
            <ListRow
              key="#completed"
              title={`Completed (${doneTasks.length})`}
              trailing={showCompleted ? 'Hide' : 'Show'}
              dim
              highlighted={isHighlighted}
              onClick={() => activate(row)}
            />
          )

        const { task } = row
        return (
          <ListRow
            key={task.id}
            leading={
              <div
                className={styles.check}
                data-done={task.done}
                data-pending={isPending(toggles, task.id)}
              >
                {task.done && (
                  <span className="material-icons">check</span>
                )}
              </div>
            }
            title={task.title}
            subtitle={task.dueLabel}
            dim={task.done}
            strike={task.done}
            error={failed.includes(task.id)}
            highlighted={isHighlighted}
            onClick={() => activate(row)}
          />
        )
      })}
    </div>
  )
}

export default Todo
