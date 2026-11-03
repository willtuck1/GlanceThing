export interface CoalescerTimers {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: never) => void
}

export interface Coalescer {
  trigger(): void
  /** Runs a pending trailing call now. */
  flush(): void
  /** Drops a pending trailing call. */
  cancel(): void
}

/**
 * Runs `fn` at most once per `ms`: a trigger outside a window runs at once and
 * opens a window; triggers inside it collapse into one call when it closes.
 * `fn` reads current state itself, so the trailing call sees the latest data.
 */
export function createCoalescer(
  fn: () => void,
  ms = 250,
  timers: CoalescerTimers = { setTimeout, clearTimeout }
): Coalescer {
  let handle: unknown = null
  let pending = false

  function openWindow(): void {
    handle = timers.setTimeout(() => {
      handle = null
      if (pending) {
        pending = false
        openWindow()
        fn()
      }
    }, ms)
  }

  function stopWindow(): void {
    if (handle !== null) timers.clearTimeout(handle as never)
    handle = null
  }

  return {
    trigger() {
      if (handle !== null) {
        pending = true
        return
      }
      openWindow()
      fn()
    },
    flush() {
      if (!pending) return
      pending = false
      stopWindow()
      openWindow()
      fn()
    },
    cancel() {
      pending = false
      stopWindow()
    }
  }
}
