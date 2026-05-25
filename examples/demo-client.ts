/**
 * Demo client: federated tools/list and tools/call through the gateway.
 *
 * Prerequisites:
 *   1. npx tsx examples/mock-mcp-server.ts --port 9101 --namespace fs
 *   2. npx tsx examples/mock-mcp-server.ts --port 9102 --namespace db
 *   3. npm run dev
 */
const GATEWAY = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8787/gateway'
const TOKEN = process.env.GATEWAY_TOKEN ?? 'agent-alpha'

async function mcpCall(method: string, params?: Record<string, unknown>) {
  const res = await fetch(`${GATEWAY}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  })
  const json = await res.json()
  console.log(`\n=== ${method} (HTTP ${res.status}) ===`)
  console.log(JSON.stringify(json, null, 2))
}

async function main() {
  await mcpCall('tools/list')
  await mcpCall('tools/call', {
    name: 'fs:read_file',
    arguments: { path: '/tmp/demo.txt' },
  })
}

main().catch(console.error)
