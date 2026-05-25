/** JSON-RPC 2.0 and MCP protocol types (minimal subset for gateway logic). */

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: JsonRpcError
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

export const MCP_METHODS = {
  INITIALIZE: 'initialize',
  TOOLS_LIST: 'tools/list',
  TOOLS_CALL: 'tools/call',
  RESOURCES_LIST: 'resources/list',
  RESOURCES_READ: 'resources/read',
  PING: 'ping',
} as const

export type McpMethod = (typeof MCP_METHODS)[keyof typeof MCP_METHODS] | string

export interface ToolDescriptor {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  /** Fully qualified name: namespace:tool_name */
  qualifiedName: string
  serverId: string
  namespace: string
}

export interface McpServerRecord {
  id: string
  endpoint: string
  namespace: string
  capabilities: ('tools' | 'resources' | 'prompts')[]
  healthy: boolean
  lastHealthCheck?: number
}

export interface GatewayRequestContext {
  requestId: string
  principal: string
  method: string
  toolName?: string
  targetServerId?: string
  startTime: number
}
