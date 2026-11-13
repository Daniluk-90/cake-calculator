// Локальный сервер для проверки: раздаёт public/ и эмулирует /api/table с хранилищем в памяти.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const mem = new Map();
globalThis.__TETTA_STORE__ = {
  async get(k) { return mem.has(k) ? structuredClone(mem.get(k)) : null; },
  async setJSON(k, v) { mem.set(k, structuredClone(v)); return { modified: true }; },
  async list({ prefix }) { return { blobs: [...mem.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
};
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test123";
const { default: handler } = await import("../netlify/functions/table.mjs");

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/table") {
    const body = req.method === "POST" ? await new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); }) : undefined;
    const resp = await handler(new Request(url, { method: req.method, headers: req.headers, body }));
    res.writeHead(resp.status, Object.fromEntries(resp.headers));
    res.end(Buffer.from(await resp.arrayBuffer()));
    return;
  }
  const file = path.join(root, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(process.env.PORT || 8787, () => console.log("http://localhost:" + (process.env.PORT || 8787)));
