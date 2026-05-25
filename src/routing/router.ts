import type { GatewayConfig } from '../config.js'
import { ServerRegistry, ToolCatalog } from '../registry/server-registry.js'
import type { JsonRpcRequest } from '../types/mcp.js'
import { DiscoveryCache } from './cache.js'
import {
  createRoutingStrategy,
  type RoutingDecision,
  type RoutingStrategy,
} from './strategies.js'

export class GatewayRouter {
  private readonly strategy: RoutingStrategy
  private readonly cache: DiscoveryCache

  constructor(
    private readonly registry: ServerRegistry,
    private readonly catalog: ToolCatalog,
    config: GatewayConfig,
  ) {
    this.strategy = createRoutingStrategy(config.routing.strategy)
    this.cache = new DiscoveryCache(
      config.routing.cache.enabled,
      config.routing.cache.ttl_ms,
    )
  }

  async route(
    request: JsonRpcRequest,
    namespace?: string,
  ): Promise<RoutingDecision | null> {
    const cacheKey = 'catalog'
    let tools = this.cache.get(cacheKey)
    if (!tools) {
      await this.catalog.refresh()
      tools = this.catalog.listTools()
      this.cache.set(cacheKey, tools)
    }

    return this.strategy.route(
      request,
      this.registry.healthyServers(),
      tools,
      namespace,
    )
  }

  get strategyName(): string {
    return this.strategy.name
  }
}
