import type { ToolDescriptor } from '../types/mcp.js'

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

/**
 * TTL cache for federated tool discovery results.
 * Ablation: disable via config.routing.cache.enabled = false
 */
export class DiscoveryCache {
  private entries = new Map<string, CacheEntry<ToolDescriptor[]>>()

  constructor(
    private readonly enabled: boolean,
    private readonly ttlMs: number,
  ) {}

  get(key: string): ToolDescriptor[] | null {
    if (!this.enabled) return null
    const entry = this.entries.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key)
      return null
    }
    return entry.value
  }

  set(key: string, tools: ToolDescriptor[]): void {
    if (!this.enabled) return
    this.entries.set(key, {
      value: tools,
      expiresAt: Date.now() + this.ttlMs,
    })
  }

  invalidate(key?: string): void {
    if (key) {
      this.entries.delete(key)
    } else {
      this.entries.clear()
    }
  }

  get size(): number {
    return this.entries.size
  }
}
