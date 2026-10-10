// Test MCP server for tests only. Never import from production code.
import { IncomingMessage, ServerResponse, createServer } from 'http'
import { AddressInfo } from 'net'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

import {
  TestAuthOptions,
  TestAuthServer,
  closeServer,
  startTestAuthServer
} from './authServer.js'

export interface TestMcp {
  url: string
  calls: string[]
  auth?: TestAuthServer
  close(): Promise<void>
}

export interface TestMcpOptions {
  auth?: boolean | TestAuthOptions
  port?: number
}

export const TEST_TASKS = [
  { title: 'Review report', due: 'Mon 9:00', status: 'open' },
  { title: 'Water plants', due: 'Tue 18:30', status: 'open' },
  { title: 'Send invoice', due: 'Wed 12:00', status: 'done' }
]

const tasksJson = JSON.stringify({ tasks: TEST_TASKS })

function buildServer(calls: string[]): McpServer {
  const server = new McpServer({ name: 'test-tasks', version: '1.0.0' })
  const text = (t: string): { type: 'text'; text: string } => ({
    type: 'text',
    text: t
  })

  server.registerTool(
    'list_tasks',
    {
      description: 'List tasks',
      inputSchema: {
        from: z.string().optional(),
        to: z.string().optional(),
        list: z.string().optional()
      },
      annotations: { readOnlyHint: true }
    },
    async () => {
      calls.push('list_tasks')
      return {
        structuredContent: { tasks: TEST_TASKS },
        content: [text(tasksJson)]
      }
    }
  )
  server.registerTool(
    'list_tasks_text',
    {
      description: 'List tasks as text only',
      annotations: { readOnlyHint: true }
    },
    async () => {
      calls.push('list_tasks_text')
      return { content: [text(tasksJson)] }
    }
  )
  server.registerTool(
    'plain_text',
    { description: 'Plain text', annotations: { readOnlyHint: true } },
    async () => {
      calls.push('plain_text')
      return { content: [text('All clear')] }
    }
  )
  server.registerTool(
    'failing',
    { description: 'Always fails', annotations: { readOnlyHint: true } },
    async () => {
      calls.push('failing')
      return { isError: true, content: [text('Upstream unavailable')] }
    }
  )
  server.registerTool(
    'delete_task',
    {
      description: 'Delete a task',
      annotations: { readOnlyHint: false, destructiveHint: true }
    },
    async () => {
      calls.push('delete_task')
      return { content: [text('Deleted')] }
    }
  )
  server.registerTool(
    'echo',
    {
      description: 'Echo',
      inputSchema: { message: z.string().optional() }
    },
    async ({ message }) => {
      calls.push('echo')
      return { content: [text(message ?? '')] }
    }
  )

  server.registerResource(
    'tasks-today',
    'tasks://today',
    { mimeType: 'application/json' },
    async uri => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: tasksJson }
      ]
    })
  )
  return server
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      try {
        const s = Buffer.concat(chunks).toString('utf8')
        resolve(s ? JSON.parse(s) : undefined)
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

export async function startTestMcpServer(
  opts: TestMcpOptions = {}
): Promise<TestMcp> {
  const calls: string[] = []
  const auth = opts.auth
    ? await startTestAuthServer(opts.auth === true ? {} : opts.auth)
    : undefined
  let base = ''

  const handler = async (
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> => {
    const path = new URL(req.url ?? '/', base).pathname
    if (auth && path === '/.well-known/oauth-protected-resource') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          resource: `${base}/mcp`,
          authorization_servers: [auth.issuer]
        })
      )
      return
    }
    if (path !== '/mcp') {
      res.writeHead(404).end()
      return
    }
    if (auth) {
      const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
      if (!m || !auth.isValidAccessToken(m[1])) {
        res.writeHead(401, {
          'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`
        })
        res.end()
        return
      }
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' }).end()
      return
    }
    let body: unknown
    try {
      body = await readJson(req)
    } catch {
      res.writeHead(400).end()
      return
    }
    const server = buildServer(calls)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    })
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  }

  const http = createServer((req, res) => {
    handler(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
  await new Promise<void>(resolve =>
    http.listen(opts.port ?? 0, '127.0.0.1', resolve)
  )
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`

  return {
    url: `${base}/mcp`,
    calls,
    auth,
    async close() {
      await closeServer(http)
      await auth?.close()
    }
  }
}
