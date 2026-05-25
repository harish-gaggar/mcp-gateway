# mcp-gateway-research

Open research prototype of an MCP gateway: one HTTP entry point in front of multiple MCP backends, with federated `tools/list`, qualified tool names (`namespace:tool`), and deny-override ABAC before any upstream call.

Companion paper: [`paper/paper.tex`](paper/paper.tex) (build PDF with `make -C paper paper`).

## Requirements

- Node.js 20+ (see `.nvmrc`)
- Four terminal tabs/windows for the full demo (two mocks, gateway, then curl/demo)

## Install

```bash
git clone <your-repo-url>
cd mcp-gateway-research
npm install
```

## TL;DR

```bash
npm test                                    # 14 tests, no servers
# Terminals 1-2: mock MCP on 9101 (fs) and 9102 (db)
# Terminal 3:   npm run dev                 # gateway on 8787
npm run example:demo                        # tools/list + tools/call → HTTP 200
```

Details, port cleanup, GAP eval, and benchmarks: **Verify** below.

## Verify (recommended before publishing or after changes)

### Step 1: Unit and integration tests (no servers required)

```bash
npm test
```

Expected: `14 passed` across 4 files (`policy`, `routing`, `lifecycle`, `gap-classify`).

### Step 2: Start mock backends and gateway

Use **three** terminals from the repo root.

**Terminal A: filesystem mock (port 9101)**

```bash
npx tsx examples/mock-mcp-server.ts --port 9101 --namespace fs
```

**Terminal B: database mock (port 9102)**

```bash
npx tsx examples/mock-mcp-server.ts --port 9102 --namespace db
```

**Terminal C: gateway (port 8787)**

```bash
npm run dev
```

You should see `Mock MCP server [fs] on http://127.0.0.1:9101/mcp`, the same for `db` on 9102, and `MCP Gateway Research listening on http://127.0.0.1:8787`.

If a port is already in use (`EADDRINUSE`), free 9101, 9102, and 8787. On macOS, `lsof` takes one port per `-i` flag:

```bash
for port in 9101 9102 8787; do
  lsof -ti tcp:$port | xargs kill -9 2>/dev/null
done
```

Or pick other ports and update `registry.servers` / `gateway.port` in `config.example.yaml`.

**Terminal D: checks**

```bash
curl -s http://127.0.0.1:8787/health
# {"status":"ok"}

npm run example:demo
```

Expected demo output:

- `tools/list` → **HTTP 200** with merged tools (`fs:read_file`, `fs:write_file`, `db:…`)
- `tools/call` for `fs:read_file` → **HTTP 200** with a text result

**Optional: GAP-style harness** (gateway and mocks must still be running):

```bash
npm run eval:gap
```

Expected: summary JSON with `gap_direct` ≥ 1 (forbidden call succeeds on direct path) and gateway path blocking cross-tenant `db` access for `team-a`.

**Optional: benchmarks** (same prerequisites):

```bash
npm run bench:latency
npm run bench:throughput
npm run bench:policy
```

Writes under `results/` (gitignored).

Config: `config.example.yaml` (gateway `http://127.0.0.1:8787`, mocks on 9101/9102). Demo token: `agent-alpha` → `team-a` (see `auth.tokens` in that file).

## HTTP API

| Path | Method | Description |
|------|--------|-------------|
| `/health` | GET | Liveness |
| `/gateway/mcp` | POST | Federated MCP (JSON-RPC) |
| `/gateway/:namespace/mcp` | POST | Single-namespace MCP |
| `/gateway/metrics` | GET | Recent latency breakdown |
| `/gateway/servers` | GET | Registry / health state |

## Policy example

`team-a` may call `fs:*` tools; `team-b` may call `db:*`. Federated `tools/list` uses resource `*:*` in config so discovery works on `/gateway/mcp`. Default effect is deny.

```yaml
policy:
  default_effect: deny
  rules:
    - principal: team-a
      effect: allow
      actions: [tools/list]
      resources: ["*:*"]
    - principal: team-a
      effect: allow
      actions: [tools/call]
      resources: ["fs:*"]
    - principal: team-b
      effect: allow
      actions: [tools/list]
      resources: ["*:*"]
    - principal: team-b
      effect: allow
      actions: [tools/call]
      resources: ["db:*"]
```

Bearer tokens in `auth.tokens` map to principals (local testing only; the paper describes OAuth/JWE for deployments).

## Request path

1. Authenticate bearer → principal  
2. Rate limit  
3. Evaluate policy on MCP method + resource  
4. For federated `tools/list`, merge catalogs; otherwise route to one backend  
5. Proxy JSON-RPC (rewrite qualified names for upstream)

## Layout

```
src/           gateway, policy, routing, registry, proxy
test/          Vitest
bench/         latency, throughput, policy scripts
eval/gap/      GAP-style scenario runner
examples/      mock MCP server + demo client
paper/         LaTeX source
```

## Configuration

| File | Use |
|------|-----|
| `config.example.yaml` | Dev, tests, GAP eval |
| `config.bench.yaml` | Higher rate limits for throughput |

## Paper

With a local TeX install:

```bash
cd paper && make paper
```

Without TeX, from the `paper/` directory:

```bash
docker run --rm -v "$PWD":/work -w /work texlive/texlive:latest \
  sh -c "pdflatex paper.tex && bibtex paper && pdflatex paper.tex && pdflatex paper.tex"
```

Output: `paper/paper.pdf`.

## Citation

If you use this code or design, cite the accompanying paper (`paper/paper.tex`).
