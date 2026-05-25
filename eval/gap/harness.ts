/**
 * GAP-style evaluation harness (sketch).
 *
 * Inspired by Cartagena & Teixeira, "Mind the GAP" (arXiv:2602.16943).
 * This harness does NOT call frontier LLMs; it replays tool calls with
 * simulated text-safe labels and measures infrastructure-level TC-safe / GAP.
 *
 * Usage: start mock servers + gateway, then `npm run eval:gap`
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GapScenario, GapSummary, ScenarioFile } from './types.js'
import { buildResult } from './classify.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const GATEWAY_BASE =
  process.env.GATEWAY_BASE ?? 'http://127.0.0.1:8787'
const GATEWAY_URL =
  process.env.GATEWAY_URL ?? `${GATEWAY_BASE}/gateway/mcp`
const DIRECT_FS_URL =
  process.env.DIRECT_FS_URL ?? 'http://127.0.0.1:9101/mcp'
const DIRECT_DB_URL =
  process.env.DIRECT_DB_URL ?? 'http://127.0.0.1:9102/mcp'

function loadScenarios(): GapScenario[] {
  const path = resolve(__dirname, 'scenarios.json')
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as ScenarioFile
  return raw.scenarios
}

function directUrlForScenario(s: GapScenario): string {
  if (s.tool_call.params?.name?.toString().startsWith('db:')) {
    return DIRECT_DB_URL
  }
  if (s.domain === 'database') return DIRECT_DB_URL
  return DIRECT_FS_URL
}

async function invoke(
  url: string,
  scenario: GapScenario,
  mode: 'gateway' | 'direct',
): Promise<ReturnType<typeof buildResult>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (mode === 'gateway' && scenario.token) {
    headers.Authorization = `Bearer ${scenario.token}`
  }

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: scenario.id,
    method: scenario.tool_call.method,
    params: scenario.tool_call.params ?? {},
  })

  const start = performance.now()
  const res = await fetch(url, { method: 'POST', headers, body })
  const text = await res.text()
  const latencyMs = performance.now() - start

  let json: { error?: { message?: string }; result?: unknown } = {}
  try {
    json = JSON.parse(text) as typeof json
  } catch {
    json = { error: { message: 'non-json response' } }
  }

  return buildResult(scenario, mode, res.status, json, latencyMs)
}

function summarize(results: GapSummary['results']): GapSummary['counts'] {
  const gapResults = results.filter((r) => r.gap)
  return {
    total: results.length,
    tc_safe: results.filter((r) => r.tc_safe).length,
    t_safe: results.filter((r) => r.t_safe).length,
    gap: gapResults.length,
    gap_gateway: results.filter((r) => r.mode === 'gateway' && r.gap).length,
    gap_direct: results.filter((r) => r.mode === 'direct' && r.gap).length,
  }
}

async function main() {
  const scenarios = loadScenarios()
  const results: GapSummary['results'] = []

  for (const scenario of scenarios) {
    const gwUrl = scenario.gateway_path
      ? `${GATEWAY_BASE}${scenario.gateway_path}`
      : GATEWAY_URL
    results.push(await invoke(gwUrl, scenario, 'gateway'))

    if (scenario.tool_call.method === 'tools/call') {
      const directUrl = directUrlForScenario(scenario)
      results.push(await invoke(directUrl, scenario, 'direct'))
    }
  }

  const summary: GapSummary = {
    run_at: new Date().toISOString(),
    gateway_url: GATEWAY_URL,
    direct_url: `${DIRECT_FS_URL} | ${DIRECT_DB_URL}`,
    results,
    counts: summarize(results),
  }

  const outDir = resolve(__dirname, '../../results/gap')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, `gap-run-${Date.now()}.json`)
  writeFileSync(outPath, JSON.stringify(summary, null, 2))

  console.log('\n--- GAP-style harness summary (sketch) ---')
  console.log(JSON.stringify(summary.counts, null, 2))
  console.log(`\nWrote: ${outPath}`)
  console.log(
    '\nInterpretation: gap_direct > gap_gateway suggests the gateway blocks forbidden',
  )
  console.log(
    'tool calls that would succeed without infrastructure policy (TC-safe).',
  )
  console.log(
    'This is NOT a reproduction of the full GAP benchmark (no live LLM agents).',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
