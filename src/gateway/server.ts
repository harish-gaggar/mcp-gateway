import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import type { GatewayConfig } from '../config.js'
import { TokenAuthenticator } from '../auth/principal.js'
import { RequestLifecycle } from './lifecycle.js'
import { ServerRegistry } from '../registry/server-registry.js'
import { MetricsCollector } from '../observability/metrics.js'
import { Logger } from '../observability/logger.js'

export function createGatewayApp(
  config: GatewayConfig,
  lifecycle: RequestLifecycle,
  registry: ServerRegistry,
  metrics: MetricsCollector,
  logger: Logger,
): Hono {
  const app = new Hono()
  const basePath = config.gateway.base_path.replace(/\/$/, '')

  app.get('/health', (c) => c.json({ status: 'ok' }))

  app.get(`${basePath}/metrics`, (c) => {
    return c.json(metrics.snapshot())
  })

  app.get(`${basePath}/registry`, (c) => {
    return c.json({ servers: registry.listServers() })
  })

  app.get(`${basePath}/servers`, (c) => {
    return c.json({ servers: registry.listServers() })
  })

  // Federated MCP endpoint (no namespace)
  app.post(`${basePath}/mcp`, async (c) => {
    const body = await c.req.text()
    const auth = c.req.header('Authorization')
    const result = await lifecycle.handle(auth, body)
    return new Response(result.body, {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  // Namespace-scoped MCP endpoint
  app.post(`${basePath}/:namespace/mcp`, async (c) => {
    const namespace = c.req.param('namespace')
    const body = await c.req.text()
    const auth = c.req.header('Authorization')
    const result = await lifecycle.handle(auth, body, namespace)
    return new Response(result.body, {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  app.onError((err, c) => {
    logger.error('Unhandled error', { error: String(err) })
    return c.json({ error: 'internal_error' }, 500)
  })

  return app
}

export function startServer(
  app: Hono,
  config: GatewayConfig,
): ReturnType<typeof serve> {
  const { host, port } = config.gateway
  return serve({ fetch: app.fetch, hostname: host, port }, (info) => {
    console.log(`MCP Gateway Research listening on http://${info.address}:${info.port}`)
  })
}

export function buildGateway(config: GatewayConfig): {
  app: Hono
  registry: ServerRegistry
  lifecycle: RequestLifecycle
  metrics: MetricsCollector
} {
  const logger = new Logger(config.observability.log_level)
  const registry = ServerRegistry.fromConfig(config)
  const auth = new TokenAuthenticator(config.auth.tokens)
  const metrics = new MetricsCollector()
  const lifecycle = new RequestLifecycle(
    config,
    registry,
    auth,
    metrics,
    logger,
  )
  const app = createGatewayApp(config, lifecycle, registry, metrics, logger)
  return { app, registry, lifecycle, metrics }
}
