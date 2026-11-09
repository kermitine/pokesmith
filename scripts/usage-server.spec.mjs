import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { startUsageServer, upstreamUrl } from "./usage-server.mjs"

describe("usage adapter URL boundaries", () => {
  it("uses a fixed upstream and encodes species names", () => {
    expect(upstreamUrl("/api/usage/meta")).toBe("https://www.munchstats.com/api/v1/meta")
    const query = new URLSearchParams({ format: "gen9vgc2026", rating: "1630", month: "2026-10", species: "Mr. Mime" })
    expect(upstreamUrl(`/api/usage/pokemon?${query}`)).toContain("/Mr.%20Mime?month=2026-10")
  })
  it("rejects malformed or path-injecting query values", () => {
    expect(() => upstreamUrl("/api/usage/pokemon?format=../../&rating=0&month=2026-10&species=Pikachu")).toThrow()
    expect(() => upstreamUrl("/api/usage/pokemon?format=gen9vgc2026&rating=0&month=2026-10&species=../meta")).toThrow()
    expect(upstreamUrl("/api/usage/unrecognized")).toBeNull()
  })
})

describe("production HTTP server", () => {
  let server
  let directory
  let address

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "pokesmith-runtime-"))
    await writeFile(join(directory, "index.html"), "<title>Pokesmith runtime test</title>")
    await writeFile(join(directory, "app.js"), "console.log('Pokesmith')")
    server = await startUsageServer({ port: 0, host: "0.0.0.0", staticDirectory: directory })
    address = `http://127.0.0.1:${server.address().port}`
  })

  afterAll(async () => {
    if (server) {
      const closed = new Promise(resolve => server.close(resolve))
      server.closeAllConnections()
      await closed
    }
    if (directory) {
      await unlink(join(directory, "index.html"))
      await unlink(join(directory, "app.js"))
      await rmdir(directory)
    }
  })

  it("binds the configured container interface and exposes a local health check", async () => {
    expect(server.address().address).toBe("0.0.0.0")
    const response = await fetch(`${address}/healthz`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "ok" })
  })

  it("serves the app at the root and on client-side routes", async () => {
    for (const route of ["/", "/one-vs-one/"]) {
      const response = await fetch(address + route)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain("Pokesmith runtime test")
    }
  })

  it("serves assets with their content type and returns 404 for missing assets", async () => {
    const response = await fetch(`${address}/app.js`)
    expect(response.headers.get("content-type")).toBe("text/javascript")
    expect(await response.text()).toContain("Pokesmith")
    expect((await fetch(`${address}/missing.js`)).status).toBe(404)
  })

  it("rejects unsupported methods", async () => {
    const response = await fetch(`${address}/healthz`, { method: "POST" })
    expect(response.status).toBe(405)
    expect(response.headers.get("allow")).toBe("GET")
  })
})
