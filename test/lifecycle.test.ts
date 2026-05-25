import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { loadConfig } from '../src/config.js'
import { buildGateway } from '../src/gateway/server.js'

function mockMcpServer(tools: Array<{ name: string }>, port: number): Server {
  return createServer((req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200)
      res.end('ok')
      return
    }
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const rpc = JSON.parse(body) as { method: string; id: number }
      if (rpc.method === 'tools/list') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { tools } }))
      } else if (rpc.method === 'tools/call') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: rpc.id,
            result: { content: [{ type: 'text', text: 'ok' }] },
          }),
        )
      } else {
        res.writeHead(400)
        res.end()
      }
    })
  }).listen(port)
}

describe('RequestLifecycle integration', () => {
  let fsServer: Server
  let dbServer: Server
  const fsPort = 19101
  const dbPort = 19102

  beforeAll(async () => {
    fsServer = mockMcpServer([{ name: 'read_file' }], fsPort)
    dbServer = mockMcpServer([{ name: 'query' }], dbPort)
    await new Promise((r) => setTimeout(r, 100))
  })

  afterAll(() => {
    fsServer.close()
    dbServer.close()
  })

  it('denies unauthorized principals', async () => {
    const config = loadConfig(
      new URL('../config.example.yaml', import.meta.url).pathname,
    )
    config.registry.servers[0].endpoint = `http://127.0.0.1:${fsPort}/mcp`
    config.registry.servers[1].endpoint = `http://127.0.0.1:${dbPort}/mcp`

    const { lifecycle } = buildGateway(config)
    const result = await lifecycle.handle(
      undefined,
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      }),
    )
    expect(result.status).toBe(401)
  })

  it('allows team-a to call filesystem tools', async () => {
    const config = loadConfig(
      new URL('../config.example.yaml', import.meta.url).pathname,
    )
    config.registry.servers[0].endpoint = `http://127.0.0.1:${fsPort}/mcp`
    config.registry.servers[1].endpoint = `http://127.0.0.1:${dbPort}/mcp`

    const { lifecycle } = buildGateway(config)
    const result = await lifecycle.handle(
      'Bearer agent-alpha',
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'fs:read_file', arguments: {} },
      }),
    )
    expect(result.status).toBe(200)
    const body = JSON.parse(result.body)
    expect(body.result).toBeDefined()
  })

  it('returns federated tools/list for team-a', async () => {
    const config = loadConfig(
      new URL('../config.example.yaml', import.meta.url).pathname,
    )
    config.registry.servers[0].endpoint = `http://127.0.0.1:${fsPort}/mcp`
    config.registry.servers[1].endpoint = `http://127.0.0.1:${dbPort}/mcp`

    const { lifecycle } = buildGateway(config)
    const result = await lifecycle.handle(
      'Bearer agent-alpha',
      JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/list',
      }),
    )
    expect(result.status).toBe(200)
    const body = JSON.parse(result.body)
    const names = (body.result?.tools ?? []).map((t: { name: string }) => t.name)
    expect(names).toContain('fs:read_file')
    expect(names).toContain('db:query')
  })

  it('denies team-a from database tools', async () => {
    const config = loadConfig(
      new URL('../config.example.yaml', import.meta.url).pathname,
    )
    config.registry.servers[0].endpoint = `http://127.0.0.1:${fsPort}/mcp`
    config.registry.servers[1].endpoint = `http://127.0.0.1:${dbPort}/mcp`

    const { lifecycle } = buildGateway(config)
    const result = await lifecycle.handle(
      'Bearer agent-alpha',
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'db:query', arguments: {} },
      }),
    )
    expect(result.status).toBe(403)
  })
})
