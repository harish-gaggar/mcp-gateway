import type { GatewayConfig, ServerConfig } from '../config.js'
import type { McpServerRecord, ToolDescriptor } from '../types/mcp.js'

export class ServerRegistry {
  private servers: Map<string, McpServerRecord> = new Map()
  private readonly refreshIntervalMs: number
  private refreshTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    serverConfigs: ServerConfig[],
    refreshIntervalMs: number,
  ) {
    this.refreshIntervalMs = refreshIntervalMs
    for (const cfg of serverConfigs) {
      this.servers.set(cfg.id, {
        id: cfg.id,
        endpoint: cfg.endpoint,
        namespace: cfg.namespace,
        capabilities: cfg.capabilities,
        healthy: true,
      })
    }
  }

  startHealthChecks(): void {
    void this.runHealthChecks()
    this.refreshTimer = setInterval(
      () => void this.runHealthChecks(),
      this.refreshIntervalMs,
    )
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  listServers(): McpServerRecord[] {
    return [...this.servers.values()]
  }

  getServer(id: string): McpServerRecord | undefined {
    return this.servers.get(id)
  }

  getByNamespace(namespace: string): McpServerRecord | undefined {
    return [...this.servers.values()].find((s) => s.namespace === namespace)
  }

  healthyServers(): McpServerRecord[] {
    return [...this.servers.values()].filter((s) => s.healthy)
  }

  async runHealthChecks(): Promise<void> {
    await Promise.all(
      [...this.servers.values()].map(async (server) => {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 3000)
          const res = await fetch(server.endpoint, {
            method: 'GET',
            signal: controller.signal,
          })
          clearTimeout(timeout)
          server.healthy = res.ok || res.status === 405 || res.status === 401
        } catch {
          server.healthy = false
        }
        server.lastHealthCheck = Date.now()
      }),
    )
  }

  static fromConfig(config: GatewayConfig): ServerRegistry {
    const registry = new ServerRegistry(
      config.registry.servers,
      config.registry.refresh_interval_ms,
    )
    return registry
  }
}

/** Aggregated tool catalog across registered backends. */
export class ToolCatalog {
  private tools: Map<string, ToolDescriptor> = new Map()
  private lastRefresh = 0

  constructor(private readonly registry: ServerRegistry) {}

  async refresh(): Promise<void> {
    const servers = this.registry.healthyServers()
    const discovered: ToolDescriptor[] = []

    await Promise.all(
      servers.map(async (server) => {
        if (!server.capabilities.includes('tools')) return
        try {
          const tools = await fetchToolsFromServer(server)
          discovered.push(...tools)
        } catch {
          // Server unreachable during discovery — skip
        }
      }),
    )

    this.tools.clear()
    for (const tool of discovered) {
      this.tools.set(tool.qualifiedName, tool)
    }
    this.lastRefresh = Date.now()
  }

  listTools(): ToolDescriptor[] {
    return [...this.tools.values()]
  }

  findByQualifiedName(name: string): ToolDescriptor | undefined {
    return this.tools.get(name)
  }

  findByLocalName(localName: string): ToolDescriptor[] {
    return [...this.tools.values()].filter(
      (t) => t.name === localName || t.qualifiedName.endsWith(`:${localName}`),
    )
  }

  get lastRefreshedAt(): number {
    return this.lastRefresh
  }
}

async function fetchToolsFromServer(
  server: McpServerRecord,
): Promise<ToolDescriptor[]> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  })

  const res = await fetch(server.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  if (!res.ok) return []

  const json = (await res.json()) as {
    result?: { tools?: Array<{ name: string; description?: string }> }
  }

  const tools = json.result?.tools ?? []
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    qualifiedName: `${server.namespace}:${t.name}`,
    serverId: server.id,
    namespace: server.namespace,
  }))
}
