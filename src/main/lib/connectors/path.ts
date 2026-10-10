// Dot-path reader for connector mappings: `data.items[0].price`, '' = root.

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])
const MAX_SEGMENTS = 20
const MAX_LENGTH = 200
const PART = /^([^.[\]]*)((?:\[\d+\])*)$/

export function parsePath(path: string): (string | number)[] {
  const bad = () => new Error(`Invalid path "${path}"`)
  if (typeof path !== 'string' || path.length > MAX_LENGTH) throw bad()
  if (path === '') return []
  const segs: (string | number)[] = []
  const parts = path.split('.')
  for (let i = 0; i < parts.length; i++) {
    const m = PART.exec(parts[i])
    if (!m) throw bad()
    const name = m[1].trim()
    if (name) {
      if (FORBIDDEN.has(name)) throw bad()
      segs.push(name)
    } else if (!m[2] || i > 0) {
      // An empty name is only allowed for leading indexes: `[0].name`.
      throw bad()
    }
    for (const idx of m[2].match(/\d+/g) ?? []) {
      const n = Number(idx)
      if (!Number.isSafeInteger(n)) throw bad()
      segs.push(n)
    }
  }
  if (segs.length > MAX_SEGMENTS) throw bad()
  return segs
}

const has = (o: object, k: string | number) =>
  Object.prototype.hasOwnProperty.call(o, k)

export function getPath(
  root: unknown,
  segs: (string | number)[]
): unknown {
  let cur: unknown = root
  for (const seg of segs) {
    if (cur === null || typeof cur !== 'object') return undefined
    if (typeof seg === 'number') {
      if (!Array.isArray(cur) || !has(cur, seg)) return undefined
    } else if (Array.isArray(cur) || !has(cur, seg)) {
      return undefined
    }
    cur = (cur as Record<string | number, unknown>)[seg]
  }
  return cur
}
