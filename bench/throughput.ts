/** Throughput benchmark under concurrent gateway requests. */
const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8787/gateway/mcp'
const TOKEN = process.env.GATEWAY_TOKEN ?? 'agent-alpha'
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 50)
const DURATION_SEC = Number(process.env.DURATION_SEC ?? 10)

const payload = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'fs:read_file', arguments: {} },
})

async function worker(until: number, counter: { ok: number; err: number }) {
  while (Date.now() < until) {
    try {
      const res = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
        },
        body: payload,
      })
      if (res.ok) counter.ok++
      else counter.err++
    } catch {
      counter.err++
    }
  }
}

async function main() {
  const until = Date.now() + DURATION_SEC * 1000
  const counter = { ok: 0, err: 0 }
  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker(until, counter)),
  )
  const total = counter.ok + counter.err
  const rps = total / DURATION_SEC
  console.log(JSON.stringify({ concurrency: CONCURRENCY, durationSec: DURATION_SEC, ...counter, rps }, null, 2))
}

main().catch(console.error)
