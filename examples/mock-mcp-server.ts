/**
 * Minimal mock MCP HTTP server for local demos and benchmarks.
 * Usage: npx tsx examples/mock-mcp-server.ts --port 9101 --namespace fs
 */
import { createServer } from 'node:http'

const args = process.argv.slice(2)

function readArg(name: string, fallback: string): string {
  const eq = args.find((a) => a.startsWith(`--${name}=`))
  if (eq) return eq.split('=')[1] ?? fallback
  const i = args.indexOf(`--${name}`)
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1]
  return fallback
}

const port = Number(readArg('port', '9101'))
const namespace = readArg('namespace', 'fs')

const tools = [
  { name: 'read_file', description: `Read a file (${namespace})` },
  { name: 'write_file', description: `Write a file (${namespace})` },
]

createServer((req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200)
    res.end('ok')
    return
  }

  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const rpc = JSON.parse(body) as {
      method: string
      id: number
      params?: { name?: string }
    }

    if (rpc.method === 'tools/list') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { tools } }))
      return
    }

    if (rpc.method === 'tools/call') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: rpc.id,
          result: {
            content: [
              {
                type: 'text',
                text: `Executed ${rpc.params?.name} on ${namespace}`,
              },
            ],
          },
        }),
      )
      return
    }

    res.writeHead(400)
    res.end()
  })
}).listen(port, () => {
  console.log(`Mock MCP server [${namespace}] on http://127.0.0.1:${port}/mcp`)
})
