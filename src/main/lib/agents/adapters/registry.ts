import type { AgentAdapter } from '../types.js'
import * as claudeCode from './claude-code.js'

export const adapters: AgentAdapter[] = [claudeCode.adapter]

export function findAdapter(id: string): AgentAdapter | undefined {
  return adapters.find(a => a.id === id)
}

/** Adapter label, or the first 8 characters of an unknown source. */
export function adapterLabel(source: string): string {
  return findAdapter(source)?.label ?? source.slice(0, 8)
}
