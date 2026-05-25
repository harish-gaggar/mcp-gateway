import { resolve } from 'node:path'
import { loadConfig } from './config.js'
import { buildGateway, startServer } from './gateway/server.js'

const configPath =
  process.argv.find((a) => a.startsWith('--config='))?.split('=')[1] ??
  process.env.GATEWAY_CONFIG ??
  resolve(process.cwd(), 'config.example.yaml')

const config = loadConfig(configPath)
const { app, registry } = buildGateway(config)

registry.startHealthChecks()

const server = startServer(app, config)

function shutdown(): void {
  registry.stop()
  server.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
