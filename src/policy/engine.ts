import type { PolicyRule } from '../config.js'
import type { GatewayRequestContext } from '../types/mcp.js'

export interface PolicyDecision {
  allowed: boolean
  matchedRuleId?: string
  reason: string
}

/**
 * Attribute-based policy engine for MCP operations.
 * Resources use namespace:tool patterns (e.g., fs:read_file).
 */
export class PolicyEngine {
  constructor(
    private readonly rules: PolicyRule[],
    private readonly defaultEffect: 'allow' | 'deny',
  ) {}

  evaluate(
    principal: string,
    action: string,
    resource: string,
  ): PolicyDecision {
    const applicable = this.rules.filter((rule) =>
      this.ruleMatches(rule, principal, action, resource),
    )

    // Deny overrides allow (explicit deny-first semantics)
    const deny = applicable.find((r) => r.effect === 'deny')
    if (deny) {
      return {
        allowed: false,
        matchedRuleId: deny.id,
        reason: `Denied by rule ${deny.id}`,
      }
    }

    const allow = applicable.find((r) => r.effect === 'allow')
    if (allow) {
      return {
        allowed: true,
        matchedRuleId: allow.id,
        reason: `Allowed by rule ${allow.id}`,
      }
    }

    const allowed = this.defaultEffect === 'allow'
    return {
      allowed,
      reason: allowed
        ? 'Default allow (no matching rule)'
        : 'Default deny (no matching rule)',
    }
  }

  evaluateContext(ctx: GatewayRequestContext, resource: string): PolicyDecision {
    return this.evaluate(ctx.principal, ctx.method, resource)
  }

  private ruleMatches(
    rule: PolicyRule,
    principal: string,
    action: string,
    resource: string,
  ): boolean {
    if (rule.principal && rule.principal !== principal) {
      return false
    }
    if (!rule.actions.some((a) => matchPattern(a, action))) {
      return false
    }
    if (!rule.resources.some((r) => matchPattern(r, resource))) {
      return false
    }
    return true
  }
}

/** Glob-style pattern: * matches any segment. */
export function matchPattern(pattern: string, value: string): boolean {
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*') +
      '$',
  )
  return regex.test(value)
}
