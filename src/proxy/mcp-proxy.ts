import type { GatewayRequestContext, JsonRpcRequest } from '../types/mcp.js'
import type { McpServerRecord } from '../types/mcp.js'

export interface ProxyResult {
  status: number
  body: string
  latencyMs: number
  upstream: string
}

/**
 * Transparent MCP HTTP proxy to a single backend server.
 * Rewrites tools/call names from qualified (ns:tool) to local (tool) form.
 */
export class McpProxy {
  constructor(private readonly timeoutMs: number) {}

  async forward(
    server: McpServerRecord,
    request: JsonRpcRequest,
    ctx: GatewayRequestContext,
    rewriteToolName?: string,
  ): Promise<ProxyResult> {
    const payload = { ...request }
    if (rewriteToolName && payload.method === 'tools/call' && payload.params) {
      payload.params = { ...payload.params, name: rewriteToolName }
    }

    const start = performance.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch(server.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gateway-Request-Id': ctx.requestId,
          'X-Gateway-Principal': ctx.principal,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      const body = await res.text()
      return {
        status: res.status,
        body,
        latencyMs: performance.now() - start,
        upstream: server.endpoint,
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Upstream request failed'
      const errorBody = JSON.stringify({
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: { code: -32603, message },
      })
      return {
        status: 502,
        body: errorBody,
        latencyMs: performance.now() - start,
        upstream: server.endpoint,
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
