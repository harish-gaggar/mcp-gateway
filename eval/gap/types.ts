export interface ToolCallSpec {
  method: string
  params?: Record<string, unknown>
}

export interface GapScenario {
  id: string
  domain: string
  simulated_t_safe: boolean
  forbidden: boolean
  token: string | null
  tool_call: ToolCallSpec
  /** Override gateway URL path (e.g. /gateway/db/mcp). Default: /gateway/mcp */
  gateway_path?: string
  notes?: string
}

export interface ScenarioFile {
  scenarios: GapScenario[]
}

export type EvalMode = 'gateway' | 'direct'

export interface ScenarioResult {
  scenario_id: string
  mode: EvalMode
  http_status: number
  tc_safe: boolean
  t_safe: boolean
  gap: boolean
  latency_ms: number
  jsonrpc_error?: string
  notes?: string
}

export interface GapSummary {
  run_at: string
  gateway_url: string
  direct_url: string
  results: ScenarioResult[]
  counts: {
    total: number
    tc_safe: number
    t_safe: number
    gap: number
    gap_gateway: number
    gap_direct: number
  }
}
