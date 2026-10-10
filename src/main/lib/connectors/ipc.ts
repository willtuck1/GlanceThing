// Desktop Settings IPC for JSON connectors. Nothing returned or thrown here
// may contain a header value: list/save return the header name and
// `headerSet` only, and error messages are scrubbed of the draft's value.

import {
  ConnectorDraft,
  ConnectorForSettings,
  deleteConnector,
  getConnectorSecret,
  listConnectorsForSettings,
  saveConnector,
  testDraft
} from './store.js'
import { Connector, ConnectorView } from './types.js'

function toSettings(c: Connector): ConnectorForSettings {
  const out: ConnectorForSettings = {
    id: c.id,
    label: c.label,
    layout: c.layout,
    mapping: c.mapping,
    intervalMin: c.intervalMin,
    source: { kind: 'json', url: c.source.url },
    headerSet: false
  }
  if (c.source.header) {
    out.source.header = { name: c.source.header.name }
    out.headerSet = getConnectorSecret(c.id) !== null
  }
  return out
}

function draftSecret(draft: unknown): string | null {
  const header = (draft as { header?: unknown } | null)?.header
  if (!header || typeof header !== 'object') return null
  const value = (header as { value?: unknown }).value
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function ipcListConnectors(): ConnectorForSettings[] {
  return listConnectorsForSettings().map(toSettings)
}

// Rejects with a readable message (shown in Settings) on invalid input.
export function ipcSaveConnector(draft: unknown): ConnectorForSettings {
  try {
    return toSettings(saveConnector(draft as ConnectorDraft))
  } catch (e) {
    const raw =
      e instanceof Error && e.message
        ? e.message
        : 'Could not save connector'
    const secret = draftSecret(draft)
    throw new Error(
      secret && raw.includes(secret) ? 'Could not save connector' : raw
    )
  }
}

export function ipcDeleteConnector(id: unknown): boolean {
  return typeof id === 'string' && deleteConnector(id)
}

// Never throws; testDraft already keeps the secret out of the result.
export async function ipcTestConnector(
  draft: unknown
): Promise<{ view?: ConnectorView; error?: string }> {
  const result = await testDraft(draft)
  return result.error !== undefined
    ? { error: result.error }
    : { view: result.view }
}
