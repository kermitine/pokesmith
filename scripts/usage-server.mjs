import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, resolve, sep } from "node:path"

const source = "https://www.munchstats.com"
const cache = new Map()
const inflight = new Map()
const maxEntries = 300
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon"
}

export function upstreamUrl(requestUrl) {
  const url = new URL(requestUrl, "http://localhost")
  if (url.pathname === "/api/usage/meta") return `${source}/api/v1/meta`
  if (url.pathname !== "/api/usage/pokemon") return null
  const format = url.searchParams.get("format") ?? ""
  const rating = url.searchParams.get("rating") ?? ""
  const month = url.searchParams.get("month") ?? ""
  const species = url.searchParams.get("species") ?? ""
  if (!/^[a-z0-9]{3,90}$/.test(format) || !/^\d{1,4}$/.test(rating) || !/^\d{4}-\d{2}$/.test(month) || !species || species.length > 80 || /[\x00-\x1f/\\]/.test(species)) throw new Error("Invalid usage query.")
  return `${source}/api/v1/pokemon/${format}/${rating}/${encodeURIComponent(species)}?month=${month}`
}

async function fetchUsage(url) {
  const old = cache.get(url)
  if (old && old.expires > Date.now()) return old.body
  if (inflight.has(url)) return inflight.get(url)
  const promise = (async () => {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Pokesmith/0.1", ...(old?.etag ? { "If-None-Match": old.etag } : {}) }, signal: AbortSignal.timeout(15000) })
    if (response.status === 304 && old) {
      old.expires = Date.now() + 900000
      return old.body
    }
    if (!response.ok) throw Object.assign(new Error("Usage data unavailable for this selection."), { status: response.status === 404 ? 404 : 502 })
    const body = await response.json()
    if (!body || typeof body !== "object") throw new Error("Invalid upstream response.")
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value)
    cache.set(url, { body, etag: response.headers.get("etag"), expires: Date.now() + 900000 })
    return body
  })().finally(() => inflight.delete(url))
  inflight.set(url, promise)
  return promise
}

export async function startUsageServer({ port = 5180, host = "127.0.0.1", staticDirectory } = {}) {
  const server = createServer(async (req, res) => {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" })
      res.end()
      return
    }
    const url = new URL(req.url ?? "/", "http://localhost")
    if (url.pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" })
      res.end(JSON.stringify({ status: "ok" }))
      return
    }
    if (url.pathname.startsWith("/api/usage/")) {
      try {
        const upstream = upstreamUrl(req.url)
        if (!upstream) {
          res.writeHead(404)
          res.end()
          return
        }
        const data = await fetchUsage(upstream)
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" })
        res.end(JSON.stringify(data))
      } catch (error) {
        res.writeHead(error.status ?? (error.message === "Invalid usage query." ? 400 : 502), { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: error.message === "Invalid usage query." ? error.message : "Usage source unavailable. Manual opponent entry still works." }))
      }
      return
    }
    if (!staticDirectory) {
      res.writeHead(404)
      res.end()
      return
    }
    try {
      const base = resolve(staticDirectory)
      const path = resolve(base, `.${decodeURIComponent(url.pathname)}`)
      if (path !== base && !path.startsWith(base + sep)) {
        res.writeHead(403)
        res.end()
        return
      }
      let body
      let extension = extname(path)
      try {
        body = await readFile(path)
      } catch {
        if (extension) {
          res.writeHead(404)
          res.end()
          return
        }
        body = await readFile(resolve(base, "index.html"))
        extension = ".html"
      }
      res.writeHead(200, { "Content-Type": contentTypes[extension] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" })
      res.end(body)
    } catch {
      res.writeHead(400)
      res.end()
    }
  })
  await new Promise((done, reject) => {
    server.once("error", reject)
    server.listen(port, host, done)
  })
  console.log(`${staticDirectory ? "Pokesmith" : "Usage adapter"}: http://${host}:${server.address().port}`)
  return server
}
