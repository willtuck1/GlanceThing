// Muted color washes for list rows. They are drawn as a background image
// over the row's own dark background color, so highlight and error states
// still show through. Chrome 69 handles rgba and hard-stop gradients.

export const TINT_ALPHA = 0.45
// Team colors are bright and fill the whole row, so they sit lower.
export const TEAM_TINT_ALPHA = 0.25

const HEX = /^#([0-9a-f]{6})$/i

export function rgba(hex: string | undefined, alpha = TINT_ALPHA) {
  const m = hex ? HEX.exec(hex) : null
  if (!m) return null
  const n = parseInt(m[1], 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`
}

// One color across the whole row.
export function tint(hex: string | undefined, alpha = TINT_ALPHA) {
  const c = rgba(hex, alpha)
  return c ? `linear-gradient(${c}, ${c})` : undefined
}

// One color per sports row: the favorite's if exactly one team is a
// favorite, else the away (left) team's. No fallback to the other team.
export function rowTeamColor(
  away: { key: string; color?: string },
  home: { key: string; color?: string },
  favorites: string[]
) {
  const homeOnly = favorites.includes(home.key) && !favorites.includes(away.key)
  return homeOnly ? home.color : away.color
}
