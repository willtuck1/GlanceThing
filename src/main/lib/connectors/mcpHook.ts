// Replaceable entry point for running an MCP connector. The MCP client sets
// the runner at startup; until then MCP connectors report an error.

import { Connector, ConnectorView } from './types.js'

type Runner = (c: Connector) => Promise<ConnectorView>

let runner: Runner | null = null

export function setMcpRunner(fn: Runner | null): void {
  runner = fn
}

export async function runMcpConnector(
  c: Connector
): Promise<ConnectorView> {
  if (!runner) throw new Error('MCP connectors are not available')
  return runner(c)
}
