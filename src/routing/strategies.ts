import type { McpServerRecord, ToolDescriptor } from '../types/mcp.js'
import type { JsonRpcRequest } from '../types/mcp.js'

export interface RoutingDecision {
  server: McpServerRecord
  tool?: ToolDescriptor
  strategy: string
}

export interface RoutingStrategy {
  readonly name: string
  route(
    request: JsonRpcRequest,
    servers: McpServerRecord[],
    catalog: ToolDescriptor[],
    explicitNamespace?: string,
  ): RoutingDecision | null
}

/** Route by URL path namespace only. */
export class StaticRoutingStrategy implements RoutingStrategy {
  readonly name = 'static'

  route(
    _request: JsonRpcRequest,
    servers: McpServerRecord[],
    _catalog: ToolDescriptor[],
    explicitNamespace?: string,
  ): RoutingDecision | null {
    if (!explicitNamespace) return null
    const server = servers.find((s) => s.namespace === explicitNamespace)
    if (!server) return null
    return { server, strategy: this.name }
  }
}

/** Round-robin among healthy servers (research baseline). */
export class RoundRobinRoutingStrategy implements RoutingStrategy {
  readonly name = 'round_robin'
  private index = 0

  route(
    _request: JsonRpcRequest,
    servers: McpServerRecord[],
  ): RoutingDecision | null {
    const healthy = servers.filter((s) => s.healthy)
    if (healthy.length === 0) return null
    const server = healthy[this.index % healthy.length]
    this.index += 1
    return { server, strategy: this.name }
  }
}

/**
 * Capability-aware routing: resolve tools/call to the server
 * that advertises the tool in the federated catalog.
 */
export class CapabilityAwareRoutingStrategy implements RoutingStrategy {
  readonly name = 'capability_aware'

  route(
    request: JsonRpcRequest,
    servers: McpServerRecord[],
    catalog: ToolDescriptor[],
    explicitNamespace?: string,
  ): RoutingDecision | null {
    if (explicitNamespace) {
      const server = servers.find((s) => s.namespace === explicitNamespace)
      if (server) return { server, strategy: this.name }
    }

    if (request.method === 'tools/call') {
      const toolName = request.params?.name
      if (typeof toolName !== 'string') return null

      // Qualified name: namespace:tool
      if (toolName.includes(':')) {
        const tool = catalog.find((t) => t.qualifiedName === toolName)
        if (tool) {
          const server = servers.find((s) => s.id === tool.serverId)
          if (server) return { server, tool, strategy: this.name }
        }
      }

      const matches = catalog.filter((t) => t.name === toolName)
      if (matches.length === 1) {
        const server = servers.find((s) => s.id === matches[0].serverId)
        if (server) return { server, tool: matches[0], strategy: this.name }
      }
      if (matches.length > 1) {
        return null // ambiguous — caller must qualify
      }
    }

    // Non-tool methods: use namespace if present, else first healthy server
    if (explicitNamespace) {
      const server = servers.find((s) => s.namespace === explicitNamespace)
      if (server) return { server, strategy: this.name }
    }

    const healthy = servers.filter((s) => s.healthy)
    if (healthy.length === 1) {
      return { server: healthy[0], strategy: this.name }
    }

    return null
  }
}

export function createRoutingStrategy(
  name: 'static' | 'round_robin' | 'capability_aware',
): RoutingStrategy {
  switch (name) {
    case 'static':
      return new StaticRoutingStrategy()
    case 'round_robin':
      return new RoundRobinRoutingStrategy()
    case 'capability_aware':
      return new CapabilityAwareRoutingStrategy()
  }
}
