import { describe, it, expect } from 'vitest'
import { PolicyEngine, matchPattern } from '../src/policy/engine.js'

describe('PolicyEngine', () => {
  const engine = new PolicyEngine(
    [
      {
        id: 'allow-fs',
        principal: 'team-a',
        effect: 'allow',
        actions: ['tools/call', 'tools/list'],
        resources: ['fs:*'],
      },
      {
        id: 'deny-delete',
        effect: 'deny',
        actions: ['tools/call'],
        resources: ['*:delete_*'],
      },
    ],
    'deny',
  )

  it('allows matching allow rule', () => {
    const d = engine.evaluate('team-a', 'tools/call', 'fs:read_file')
    expect(d.allowed).toBe(true)
    expect(d.matchedRuleId).toBe('allow-fs')
  })

  it('denies by default when no rule matches', () => {
    const d = engine.evaluate('team-c', 'tools/call', 'fs:read_file')
    expect(d.allowed).toBe(false)
  })

  it('deny overrides allow', () => {
    const d = engine.evaluate('team-a', 'tools/call', 'fs:delete_file')
    expect(d.allowed).toBe(false)
    expect(d.matchedRuleId).toBe('deny-delete')
  })
})

describe('matchPattern', () => {
  it('matches wildcards', () => {
    expect(matchPattern('fs:*', 'fs:read_file')).toBe(true)
    expect(matchPattern('fs:*', 'db:read_file')).toBe(false)
    expect(matchPattern('*:delete_*', 'fs:delete_file')).toBe(true)
  })
})
