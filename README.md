# Federated MCP Control Plane/Gateway

Research prototype and paper for an MCP control plane: one HTTP entry point in front of multiple backends, federated `tools/list`, qualified tool names (`namespace:tool`), and deny-override ABAC before upstream calls.

Paper source: [`paper/paper.tex`](paper/paper.tex). arXiv upload bundle: [`paper/arxiv-submission.tar.gz`](paper/arxiv-submission.tar.gz).

Related work: Brett (arXiv:2504.19997) covers simplified secure MCP gateways and tunneling; this repo focuses on catalog federation, tool-level policy, and benchmarks.

## Prerequisites

| Tool | Version | Check |
|------|---------|--------|
| [Node.js](https://nodejs.org/) | 20+ | `node -v` |
| npm | 10+ | `npm -v` |
| git | any recent | `git --version` |
| curl | any recent | `curl --version` |

Optional: **nvm** (`nvm use` reads `.nvmrc`); **Docker** for building the PDF without local TeX (see [Paper](#paper)).

For the full demo you need four terminal tabs. Ports **9101**, **9102**, and **8787** must be free on localhost.

## Install

```bash
git clone https://github.com/harish-gaggar/mcp-gateway.git
cd mcp-gateway
npm install
```

## Quick check

```bash
npm install
npm test
```

Expected: `14 passed` in four test files (`policy`, `routing`, `lifecycle`, `gap-classify`). These are the correctness claims in Section~V of the paper.

## Run the demo

**Terminal 1 (filesystem mock, port 9101):**

```bash
npx tsx examples/mock-mcp-server.ts --port 9101 --namespace fs
```

**Terminal 2 (database mock, port 9102):**

```bash
npx tsx examples/mock-mcp-server.ts --port 9102 --namespace db
```

**Terminal 3 (gateway, port 8787):**

```bash
npm run dev
```

**Terminal 4:**

```bash
curl -s http://127.0.0.1:8787/health
npm run example:demo
```

Expected: `tools/list` and `tools/call` both return HTTP 200. Demo uses bearer `agent-alpha` (maps to `team-a` in `config.example.yaml`).

If you see `EADDRINUSE`, free the ports (macOS):

```bash
for port in 9101 9102 8787; do
  lsof -ti tcp:$port | xargs kill -9 2>/dev/null
done
```

**Optional** (with mocks and gateway still running):

```bash
npm run eval:gap
npm run bench:latency
npm run bench:throughput
npm run bench:policy
```

Benchmark output goes under `results/` (gitignored).

## Reproducing the paper (Section V)

| Claim | Command |
|-------|---------|
| Correctness (14 tests) | `npm test` |
| Federated demo / lifecycle | [Run the demo](#run-the-demo) + `npm run example:demo` |
| GAP cross-tenant harness | `npm run eval:gap` |
| Latency / throughput / policy plots | `npm run bench:latency`, `bench:throughput`, `bench:policy` |

Raw benchmark series are written to `results/` (see `bench/generate-plot-data.ts`). IEEE two-column PDF: `cd paper/ieee && node sync-content.mjs && tectonic paper.tex` ([Tectonic](https://tectonic-typesetting.github.io/) required). arXiv PDF: `cd paper && make paper`.

## HTTP API

| Path | Method | Description |
|------|--------|-------------|
| `/health` | GET | Liveness |
| `/gateway/mcp` | POST | Federated MCP (JSON-RPC) |
| `/gateway/:namespace/mcp` | POST | Namespace-scoped MCP |
| `/gateway/metrics` | GET | Latency snapshot |
| `/gateway/servers` | GET | Registry state |

## Policy (example)

`team-a` may call `fs:*`; `team-b` may call `db:*`. Federated `tools/list` uses `*:*` in the rules below. Default effect is deny.

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

Bearer tokens in config are for local tests only; the paper describes OAuth/JWE for deployments.

## Repository layout

```
src/        gateway, policy, routing, registry, proxy
test/       Vitest
bench/      latency, throughput, policy scripts
eval/gap/   cross-tenant safety harness
examples/   mock MCP server and demo client
paper/      LaTeX and arxiv-submission.tar.gz
```

## Paper

```bash
cd paper && make paper
```

Or with Docker (from `paper/`):

```bash
docker run --rm -v "$PWD":/work -w /work texlive/texlive:latest \
  sh -c "pdflatex paper.tex && bibtex paper && pdflatex paper.tex && pdflatex paper.tex"
```

## Citation

Cite the accompanying paper (`paper/paper.tex`).
