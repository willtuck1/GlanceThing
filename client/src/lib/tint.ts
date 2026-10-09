// Muted color washes for list rows. They are drawn as a background image
// over the row's own dark background color, so highlight and error states
// still show through. Chrome 69 handles rgba and hard-stop gradients.

export const TINT_ALPHA = 0.45
// Team colors are bright and fill a whole half row, so they sit lower.
export const TEAM_TINT_ALPHA = 0.25

const HEX = /^#([0-9a-f]{6})$/i

export function rgba(hex: string | undefined, alpha = TINT_ALPHA) {
  const m = hex ? HEX.exec(hex) : null
  if (!m) return null
  const n = parseInt(m[1], 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`
}

// One color across the whole row.
export function tint(hex: string | undefined) {
  const c = rgba(hex)
  return c ? `linear-gradient(${c}, ${c})` : undefined
}

// Left side one color, right side the other, meeting at `at` (any CSS
// length). A missing color leaves its side plain; with neither there is no
// tint at all.
export function splitTint(
  left: string | undefined,
  right: string | undefined,
  at = '50%'
) {
  const a = rgba(left, TEAM_TINT_ALPHA)
  const b = rgba(right, TEAM_TINT_ALPHA)
  if (!a && !b) return undefined
  const clear = 'rgba(0, 0, 0, 0)'
  return `linear-gradient(to right, ${a ?? clear} ${at}, ${b ?? clear} ${at})`
}
