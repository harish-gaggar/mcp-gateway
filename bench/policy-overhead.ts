/** Micro-benchmark: ABAC evaluate() vs rule count. */
import { PolicyEngine } from '../src/policy/engine.js'

const rules = Array.from({ length: 100 }, (_, i) => ({
  id: `rule-${i}`,
  principal: i % 10 === 0 ? 'team-a' : undefined,
  effect: 'allow' as const,
  actions: ['tools/call'],
  resources: [`ns${i % 5}:*`],
}))

const engine = new PolicyEngine(rules, 'deny')
const ITERATIONS = 100_000

const start = performance.now()
for (let i = 0; i < ITERATIONS; i++) {
  engine.evaluate('team-a', 'tools/call', 'ns2:read_file')
}
const elapsed = performance.now() - start

console.log(
  JSON.stringify({
    iterations: ITERATIONS,
    totalMs: elapsed,
    avgUs: (elapsed / ITERATIONS) * 1000,
  }),
)
