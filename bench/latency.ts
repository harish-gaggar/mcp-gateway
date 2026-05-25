/**
 * Latency benchmark: gateway-mediated vs direct MCP access.
 *
 * Usage:
 *   GATEWAY_URL=http://127.0.0.1:8787/gateway \
 *   DIRECT_URL=http://127.0.0.1:9101/mcp \
 *   GATEWAY_TOKEN=agent-alpha \
 *   npx tsx bench/latency.ts
 */

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8787/gateway/mcp'
const DIRECT_URL = process.env.DIRECT_URL ?? 'http://127.0.0.1:9101/mcp'
const TOKEN = process.env.GATEWAY_TOKEN ?? 'agent-alpha'
const ITERATIONS = Number(process.env.ITERATIONS ?? 200)
const WARMUP = Number(process.env.WARMUP ?? 20)

const payload = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'fs:read_file', arguments: {} },
})

async function measure(url: string, headers: Record<string, string>): Promise<number[]> {
  const samples: number[] = []
  for (let i = 0; i < WARMUP + ITERATIONS; i++) {
    const start = performance.now()
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: payload,
    })
    if (i >= WARMUP) samples.push(performance.now() - start)
  }
  return samples
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b)
  const p = (q: number) => sorted[Math.ceil(sorted.length * q) - 1] ?? 0
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  return { mean, p50: p(0.5), p99: p(0.99) }
}

async function main() {
  console.log(`Iterations: ${ITERATIONS}, warmup: ${WARMUP}`)
  const direct = await measure(DIRECT_URL, {})
  const gateway = await measure(GATEWAY_URL, {
    Authorization: `Bearer ${TOKEN}`,
  })

  const directStats = stats(direct)
  const gatewayStats = stats(gateway)
  const overheadMs = gatewayStats.p50 - directStats.p50
  const overheadPct = (overheadMs / directStats.p50) * 100

  console.log('\n--- Results ---')
  console.log(JSON.stringify({ direct: directStats, gateway: gatewayStats, overheadMs, overheadPct }, null, 2))
}

main().catch(console.error)
