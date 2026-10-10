// Input handling for the ringing-timer overlay, kept free of the DOM.
export const shouldDismiss = (state: string | undefined): boolean =>
  state === 'ringing'

/** One dismissal per ringing: later inputs are still swallowed but ignored. */
export const createDismissHandler = (
  send: (action: string) => void,
  wake: () => void
) => {
  let done = false
  return (e: {
    stopImmediatePropagation: () => void
    preventDefault: () => void
    cancelable?: boolean
  }) => {
    e.stopImmediatePropagation()
    if (e.cancelable) e.preventDefault()
    if (done) return
    done = true
    send('dismiss')
    wake()
  }
}
