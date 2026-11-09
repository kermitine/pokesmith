import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { startUsageServer } from "./usage-server.mjs"

const port = Number(process.env.PORT ?? 3000)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.")
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const server = await startUsageServer({
  port,
  host: process.env.HOST ?? "0.0.0.0",
  staticDirectory: resolve(root, "dist/browser")
})

let stopping = false
function shutdown() {
  if (stopping) return
  stopping = true
  server.close(() => process.exit(0))
  server.closeIdleConnections()
  setTimeout(() => {
    server.closeAllConnections()
    process.exit(0)
  }, 10000).unref()
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
