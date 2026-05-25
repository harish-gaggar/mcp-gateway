import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

const ServerSchema = z.object({
  id: z.string(),
  endpoint: z.string().url(),
  namespace: z.string(),
  capabilities: z
    .array(z.enum(['tools', 'resources', 'prompts']))
    .default(['tools']),
})

const PolicyRuleSchema = z.object({
  id: z.string(),
  principal: z.string().optional(),
  effect: z.enum(['allow', 'deny']),
  actions: z.array(z.string()),
  resources: z.array(z.string()),
})

export const GatewayConfigSchema = z.object({
  gateway: z.object({
    host: z.string().default('127.0.0.1'),
    port: z.number().int().positive().default(8787),
    base_path: z.string().default('/gateway'),
  }),
  auth: z.object({
    tokens: z.record(z.string(), z.string()).default({}),
  }),
  registry: z.object({
    refresh_interval_ms: z.number().positive().default(30_000),
    servers: z.array(ServerSchema).min(1),
  }),
  routing: z.object({
    strategy: z
      .enum(['static', 'round_robin', 'capability_aware'])
      .default('capability_aware'),
    cache: z
      .object({
        enabled: z.boolean().default(true),
        ttl_ms: z.number().positive().default(60_000),
      })
      .default({}),
  }),
  policy: z.object({
    default_effect: z.enum(['allow', 'deny']).default('deny'),
    rules: z.array(PolicyRuleSchema).default([]),
  }),
  observability: z.object({
    log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    metrics_enabled: z.boolean().default(true),
    trace_sampling: z.number().min(0).max(1).default(1),
  }),
  limits: z.object({
    max_body_bytes: z.number().positive().default(1_048_576),
    request_timeout_ms: z.number().positive().default(30_000),
    rate_limit_rpm: z.number().positive().default(120),
  }),
})

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>
export type PolicyRule = z.infer<typeof PolicyRuleSchema>
export type ServerConfig = z.infer<typeof ServerSchema>

export function loadConfig(path: string): GatewayConfig {
  const raw = readFileSync(path, 'utf-8')
  const parsed = parseYaml(raw)
  return GatewayConfigSchema.parse(parsed)
}
