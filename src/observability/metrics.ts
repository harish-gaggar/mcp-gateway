export interface RequestMetric {
  requestId: string
  method: string
  principal: string
  serverId?: string
  allowed: boolean
  latencyMs: number
  policyMs: number
  routingMs: number
  upstreamMs: number
  timestamp: number
}

export class MetricsCollector {
  private metrics: RequestMetric[] = []
  private readonly maxSamples: number

  constructor(maxSamples = 10_000) {
    this.maxSamples = maxSamples
  }

  record(metric: RequestMetric): void {
    this.metrics.push(metric)
    if (this.metrics.length > this.maxSamples) {
      this.metrics.shift()
    }
  }

  snapshot(): {
    count: number
    p50LatencyMs: number
    p99LatencyMs: number
    denyRate: number
    avgPolicyMs: number
  } {
    if (this.metrics.length === 0) {
      return { count: 0, p50LatencyMs: 0, p99LatencyMs: 0, denyRate: 0, avgPolicyMs: 0 }
    }

    const latencies = this.metrics.map((m) => m.latencyMs).sort((a, b) => a - b)
    const denied = this.metrics.filter((m) => !m.allowed).length
    const policySum = this.metrics.reduce((s, m) => s + m.policyMs, 0)

    return {
      count: this.metrics.length,
      p50LatencyMs: percentile(latencies, 0.5),
      p99LatencyMs: percentile(latencies, 0.99),
      denyRate: denied / this.metrics.length,
      avgPolicyMs: policySum / this.metrics.length,
    }
  }

  reset(): void {
    this.metrics = []
  }

  exportAll(): RequestMetric[] {
    return [...this.metrics]
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil(sorted.length * p) - 1
  return sorted[Math.max(0, idx)] ?? 0
}

export function createRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}
