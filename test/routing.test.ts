import { describe, it, expect } from 'vitest'
import {
  CapabilityAwareRoutingStrategy,
  StaticRoutingStrategy,
} from '../src/routing/strategies.js'
import type { McpServerRecord, ToolDescriptor } from '../src/types/mcp.js'

const servers: McpServerRecord[] = [
  {
    id: 'filesystem',
    endpoint: 'http://localhost:9101/mcp',
    namespace: 'fs',
    capabilities: ['tools'],
    healthy: true,
  },
  {
    id: 'database',
    endpoint: 'http://localhost:9102/mcp',
    namespace: 'db',
    capabilities: ['tools'],
    healthy: true,
  },
]

const catalog: ToolDescriptor[] = [
  {
    name: 'read_file',
    qualifiedName: 'fs:read_file',
    serverId: 'filesystem',
    namespace: 'fs',
  },
  {
    name: 'query',
    qualifiedName: 'db:query',
    serverId: 'database',
    namespace: 'db',
  },
]

describe('CapabilityAwareRoutingStrategy', () => {
  const strategy = new CapabilityAwareRoutingStrategy()

  it('routes qualified tool names', () => {
    const decision = strategy.route(
      {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'db:query' },
      },
      servers,
      catalog,
    )
    expect(decision?.server.id).toBe('database')
    expect(decision?.tool?.name).toBe('query')
  })

  it('returns null for ambiguous unqualified names', () => {
    const ambiguousCatalog: ToolDescriptor[] = [
      ...catalog,
      {
        name: 'query',
        qualifiedName: 'fs:query',
        serverId: 'filesystem',
        namespace: 'fs',
      },
    ]
    const decision = strategy.route(
      {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'query' },
      },
      servers,
      ambiguousCatalog,
    )
    expect(decision).toBeNull()
  })
})

describe('StaticRoutingStrategy', () => {
  const strategy = new StaticRoutingStrategy()

  it('routes by namespace', () => {
    const decision = strategy.route(
      { jsonrpc: '2.0', method: 'tools/list' },
      servers,
      catalog,
      'fs',
    )
    expect(decision?.server.namespace).toBe('fs')
  })
})
