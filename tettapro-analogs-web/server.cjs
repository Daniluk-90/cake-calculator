// Локальный сервер сайта подбора аналогов TETTAPRO (тестовый режим на компьютере).
// Раздаёт сайт и API /api/table; таблица хранится в файле data/table.json.
// Используется программой Windows/Mac (встроен) и может запускаться отдельно: node server.cjs
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
};

const clean = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

function validate(body) {
  if (!body || !Array.isArray(body.rows)) return { error: "Нет списка строк (rows)." };
  if (body.rows.length === 0) return { error: "Таблица пустая." };
  if (body.rows.length > 20000) return { error: "Слишком много строк (больше 20 000)." };
  const rows = [];
  for (const r of body.rows) {
    const row = { brand: clean(r.brand, 120), model: clean(r.model, 200), tetta: clean(r.tetta, 120) || "Нет",
                  result: clean(r.result, 300), conditions: clean(r.conditions, 2000) };
    if (row.brand && row.model) rows.push(row);
  }
  return rows.length ? { rows } : { error: "Нет ни одной строки с брендом и моделью." };
}

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({}, CORS, headers));
  res.end(body);
}
const sendJson = (res, status, data) =>
  send(res, status, JSON.stringify(data), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });

/**
 * Запуск сервера.
 * @param {{root:string, dataDir:string, password?:string, port?:number, host?:string}} opts
 * @returns {Promise<{server: http.Server, url: string, port: number}>}
 */
function startServer(opts) {
  const root = path.resolve(opts.root);
  const dataDir = path.resolve(opts.dataDir);
  const password = opts.password || "tettapro";
  const host = opts.host || "127.0.0.1";
  const tableFile = path.join(dataDir, "table.json");
  fs.mkdirSync(path.join(dataDir, "history"), { recursive: true });

  const readTable = () => { try { return JSON.parse(fs.readFileSync(tableFile, "utf8")); } catch { return null; } };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "OPTIONS") return send(res, 204, "");

    if (url.pathname === "/api/health") return sendJson(res, 200, { app: "tettapro-analogs", ok: true });

    if (url.pathname === "/api/table") {
      if (req.method === "GET") {
        const t = readTable();
        return t ? sendJson(res, 200, t) : sendJson(res, 404, { empty: true });
      }
      if (req.method === "POST") {
        if ((req.headers["x-admin-password"] || "") !== password) return sendJson(res, 401, { error: "Неверный пароль." });
        let size = 0; const chunks = [];
        req.on("data", (c) => { size += c.length; if (size > 20e6) req.destroy(); else chunks.push(c); });
        req.on("end", () => {
          let body;
          try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return sendJson(res, 400, { error: "Ожидается JSON." }); }
          const { rows, error } = validate(body);
          if (error) return sendJson(res, 400, { error });
          const updatedAt = new Date().toISOString();
          const prev = readTable();
          if (prev) fs.writeFileSync(path.join(dataDir, "history", (prev.updatedAt || updatedAt).replace(/[:.]/g, "-") + ".json"), JSON.stringify(prev));
          const tmp = tableFile + ".tmp";
          fs.writeFileSync(tmp, JSON.stringify({ updatedAt, source: clean(body.source, 200) || "Загружено", rows }));
          fs.renameSync(tmp, tableFile);
          sendJson(res, 200, { ok: true, updatedAt, count: rows.length });
        });
        return;
      }
      return sendJson(res, 405, { error: "Метод не поддерживается." });
    }

    // Файлы сайта
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(root, rel);
    if (!file.startsWith(root + path.sep)) return send(res, 403, "forbidden");
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, "not found", { "Content-Type": "text/plain; charset=utf-8" });
      send(res, 200, data, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port || 8787, host, () => {
      const port = server.address().port;
      resolve({ server, port, url: `http://localhost:${port}` });
    });
  });
}

module.exports = { startServer };

// Отдельный запуск: node server.cjs  (PORT, HOST, ADMIN_PASSWORD — по желанию)
if (require.main === module) {
  startServer({
    root: path.join(__dirname, "public"),
    dataDir: process.env.DATA_DIR || path.join(__dirname, "data"),
    password: process.env.ADMIN_PASSWORD,
    port: Number(process.env.PORT) || 8787,
    host: process.env.HOST,
  }).then(({ url }) => {
    console.log(`Сайт подбора аналогов TETTAPRO запущен: ${url}`);
    console.log(`Пароль для загрузки таблиц: ${process.env.ADMIN_PASSWORD || "tettapro"}`);
    console.log("Остановить: Ctrl+C");
  }).catch((e) => {
    console.error(e.code === "EADDRINUSE" ? "Порт уже занят — сайт, вероятно, уже запущен (например, программой)." : e.message);
    process.exit(1);
  });
}
