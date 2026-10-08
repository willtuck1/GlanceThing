export const AXIS_LOCK_PX = 10
export const SNAP_FRACTION = 0.25
export const SNAP_VELOCITY = 0.5

interface SnapInput {
  dx: number
  width: number
  elapsedMs: number
  index: number
  count: number
}

// Decides which page to settle on after a horizontal drag. Dragging left
// (negative dx) goes to the next page.
export function resolveSnap({
  dx,
  width,
  elapsedMs,
  index,
  count
}: SnapInput) {
  const velocity = elapsedMs > 0 ? Math.abs(dx) / elapsedMs : 0
  const passes =
    Math.abs(dx) > width * SNAP_FRACTION || velocity > SNAP_VELOCITY
  if (!passes || dx === 0) return index

  const next = dx < 0 ? index + 1 : index - 1
  return Math.min(Math.max(next, 0), count - 1)
}
