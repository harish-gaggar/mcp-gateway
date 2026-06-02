import type { TokenAuthenticator } from '../auth/principal.js'
import type { GatewayConfig } from '../config.js'
import { Logger } from '../observability/logger.js'
import {
  createRequestId,
  MetricsCollector,
} from '../observability/metrics.js'
import { PolicyEngine } from '../policy/engine.js'
import { McpProxy } from '../proxy/mcp-proxy.js'
import { ServerRegistry, ToolCatalog } from '../registry/server-registry.js'
import { GatewayRouter } from '../routing/router.js'
import type { GatewayRequestContext, JsonRpcRequest } from '../types/mcp.js'
import { MCP_METHODS } from '../types/mcp.js'

export interface LifecycleResult {
  status: number
  body: string
  context: GatewayRequestContext
}

/**
 * End-to-end request lifecycle:
 * authenticate, parse, route, policy, proxy, observe
 */
export class RequestLifecycle {
  private readonly policy: PolicyEngine
  private readonly proxy: McpProxy
  private readonly router: GatewayRouter
  private readonly catalog: ToolCatalog
  private readonly rateLimitMap = new Map<string, number[]>()

  constructor(
    private readonly config: GatewayConfig,
    private readonly registry: ServerRegistry,
    private readonly auth: TokenAuthenticator,
    readonly metrics: MetricsCollector,
    private readonly logger: Logger,
  ) {
    this.policy = new PolicyEngine(
      config.policy.rules,
      config.policy.default_effect,
    )
    this.proxy = new McpProxy(config.limits.request_timeout_ms)
    this.catalog = new ToolCatalog(registry)
    this.router = new GatewayRouter(registry, this.catalog, config)
  }

  async handle(
    authorization: string | undefined,
    rawBody: string,
    namespace?: string,
  ): Promise<LifecycleResult> {
    const startTime = performance.now()
    const requestId = createRequestId()

    const principal = this.auth.authenticate(authorization)
    if (!principal) {
      return this.jsonError(401, null, 'Unauthorized', requestId, startTime, '', -32001)
    }

    if (rawBody.length > this.config.limits.max_body_bytes) {
      return this.jsonError(413, null, 'Payload too large', requestId, startTime, principal.id, -32002)
    }

    if (!this.checkRateLimit(principal.id)) {
      return this.jsonError(429, null, 'Rate limit exceeded', requestId, startTime, principal.id, -32029)
    }

    let request: JsonRpcRequest
    try {
      request = JSON.parse(rawBody) as JsonRpcRequest
    } catch {
      return this.jsonError(-32700, null, 'Parse error', requestId, startTime, principal.id)
    }

    const ctx: GatewayRequestContext = {
      requestId,
      principal: principal.id,
      method: request.method,
      startTime,
    }

    if (request.method === MCP_METHODS.TOOLS_CALL) {
      ctx.toolName =
        typeof request.params?.name === 'string'
          ? request.params.name
          : undefined
    }

    const policyStart = performance.now()
    const resource = buildResource(ctx, namespace)
    const decision = this.policy.evaluate(principal.id, request.method, resource)
    const policyMs = performance.now() - policyStart

    if (!decision.allowed) {
      this.recordMetric(ctx, false, performance.now() - startTime, policyMs, 0, 0)
      this.logger.warn('Policy denied', {
        requestId,
        principal: principal.id,
        resource,
        rule: decision.matchedRuleId,
      })
      return this.jsonError(
        403,
        request.id ?? null,
        decision.reason,
        requestId,
        startTime,
        principal.id,
      )
    }

    // Federated tools/list: merged catalog; no single-backend route required
    if (request.method === MCP_METHODS.TOOLS_LIST && !namespace) {
      const routingStart = performance.now()
      await this.catalog.refresh()
      const routingMs = performance.now() - routingStart
      const tools = this.catalog.listTools().map((t) => ({
        name: t.qualifiedName,
        description: t.description,
      }))
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: { tools },
      })
      const totalMs = performance.now() - startTime
      this.recordMetric(ctx, true, totalMs, policyMs, routingMs, 0)
      return { status: 200, body, context: ctx }
    }

    const routingStart = performance.now()
    const route = await this.router.route(request, namespace)
    const routingMs = performance.now() - routingStart

    if (!route) {
      this.recordMetric(ctx, false, performance.now() - startTime, policyMs, routingMs, 0)
      return this.jsonError(
        404,
        request.id ?? null,
        'No route to backend server',
        requestId,
        startTime,
        principal.id,
      )
    }

    ctx.targetServerId = route.server.id

    const localToolName = route.tool?.name
    const proxyResult = await this.proxy.forward(
      route.server,
      request,
      ctx,
      localToolName,
    )

    const totalMs = performance.now() - startTime
    this.recordMetric(
      ctx,
      true,
      totalMs,
      policyMs,
      routingMs,
      proxyResult.latencyMs,
    )

    this.logger.info('Request completed', {
      requestId,
      method: request.method,
      server: route.server.id,
      latencyMs: totalMs,
      status: proxyResult.status,
    })

    return {
      status: proxyResult.status,
      body: proxyResult.body,
      context: ctx,
    }
  }

  private checkRateLimit(principalId: string): boolean {
    const now = Date.now()
    const windowMs = 60_000
    const limit = this.config.limits.rate_limit_rpm
    const timestamps = (this.rateLimitMap.get(principalId) ?? []).filter(
      (t) => now - t < windowMs,
    )
    if (timestamps.length >= limit) {
      return false
    }
    timestamps.push(now)
    this.rateLimitMap.set(principalId, timestamps)
    return true
  }

  private recordMetric(
    ctx: GatewayRequestContext,
    allowed: boolean,
    latencyMs: number,
    policyMs: number,
    routingMs: number,
    upstreamMs: number,
  ): void {
    if (!this.config.observability.metrics_enabled) return
    this.metrics.record({
      requestId: ctx.requestId,
      method: ctx.method,
      principal: ctx.principal,
      serverId: ctx.targetServerId,
      allowed,
      latencyMs,
      policyMs,
      routingMs,
      upstreamMs,
      timestamp: Date.now(),
    })
  }

  private jsonError(
    httpStatus: number,
    id: string | number | null,
    message: string,
    requestId: string,
    startTime: number,
    principal: string,
    jsonRpcCode = -32000,
  ): LifecycleResult {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code: jsonRpcCode, message },
    })
    return {
      status: httpStatus,
      body,
      context: {
        requestId,
        principal,
        method: 'error',
        startTime,
      },
    }
  }
}

function buildResource(ctx: GatewayRequestContext, namespace?: string): string {
  if (ctx.toolName) {
    if (ctx.toolName.includes(':')) {
      return ctx.toolName
    }
    if (namespace) {
      return `${namespace}:${ctx.toolName}`
    }
    return `*:${ctx.toolName}`
  }
  if (namespace) {
    return `${namespace}:*`
  }
  return '*:*'
}
