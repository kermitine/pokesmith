import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const localNode = join(root, ".tools", "node", process.platform === "win32" ? "node.exe" : "bin/node")
const [major, minor] = process.versions.node.split(".").map(Number)
const supportedRuntime = (major === 24 && minor >= 15) || major >= 26
if (!supportedRuntime && !existsSync(localNode)) {
  console.error("Pokesmith requires Node 24.15 or newer. Install a supported Node version, then run this command again.")
  process.exit(1)
}
const node = supportedRuntime ? process.execPath : localNode
const env = { ...process.env, PATH: `${dirname(node)}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`, NG_CLI_ANALYTICS: "false" }
const command = process.argv[2] ?? "serve"
const children = []
let closing = false
function run(args) {
  const child = spawn(node, args, { cwd: root, env, stdio: "inherit", windowsHide: true })
  children.push(child)
  child.on("error", error => {
    console.error(error.message)
    stop(1)
  })
  return child
}
function stop(code = 0) {
  if (closing) return
  closing = true
  for (const child of children) if (!child.killed) child.kill()
  process.exitCode = code
  setTimeout(() => process.exit(code), 250).unref()
}
process.on("SIGINT", () => stop())
process.on("SIGTERM", () => stop())
if (command === "serve") {
  const { startUsageServer } = await import("./usage-server.mjs")
  const usageServer = await startUsageServer()
  process.on("exit", () => usageServer.close())
  const child = run(["node_modules/@angular/cli/bin/ng.js", "serve", "--host", "127.0.0.1", "--port", process.env.PORT ?? "5173", ...process.argv.slice(3)])
  child.on("exit", code => {
    usageServer.close()
    stop(code ?? 1)
  })
} else if (command === "preview") {
  const { startUsageServer } = await import("./usage-server.mjs")
  await startUsageServer({ port: Number(process.env.PORT ?? 5173), staticDirectory: join(root, "dist/browser") })
} else {
  const args = command === "team-tests" ? ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.pokesmith.config.mts", ...process.argv.slice(3)] : ["node_modules/@angular/cli/bin/ng.js", command, ...process.argv.slice(3)]
  run(args).on("exit", code => stop(code ?? 1))
}
