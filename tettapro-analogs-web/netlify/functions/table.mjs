// API таблицы подбора аналогов TETTAPRO.
// GET  /api/table          — текущая таблица (общая для сайта и программ Windows/Mac)
// POST /api/table          — загрузить новую таблицу (нужен пароль из переменной ADMIN_PASSWORD)
// GET  /api/table?history=1 — список прошлых версий (для отката вручную)
import { getStore } from "@netlify/blobs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
};

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS, ...extra },
  });

const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function validate(body) {
  if (!body || !Array.isArray(body.rows)) return { error: "Нет списка строк (rows)." };
  if (body.rows.length === 0) return { error: "Таблица пустая." };
  if (body.rows.length > 20000) return { error: "Слишком много строк (больше 20 000)." };
  const rows = [];
  for (const r of body.rows) {
    const row = {
      brand: clean(r.brand, 120),
      model: clean(r.model, 200),
      tetta: clean(r.tetta, 120) || "Нет",
      result: clean(r.result, 300),
      conditions: clean(r.conditions, 2000),
    };
    if (row.brand && row.model) rows.push(row);
  }
  if (rows.length === 0) return { error: "Нет ни одной строки с брендом и моделью." };
  return { rows };
}

// Сравнение пароля без раннего выхода.
function samePassword(a, b) {
  const x = new TextEncoder().encode(a || "");
  const y = new TextEncoder().encode(b || "");
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // globalThis.__TETTA_STORE__ — подмена хранилища в локальных тестах.
  const store = globalThis.__TETTA_STORE__ || getStore({ name: "tettapro-analogs", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    if (url.searchParams.has("history")) {
      const { blobs } = await store.list({ prefix: "history/" });
      return json({ versions: blobs.map((b) => b.key.replace("history/", "")).sort().reverse() });
    }
    const table = await store.get("current", { type: "json" });
    if (!table) return json({ empty: true }, 404);
    return json(table);
  }

  if (req.method === "POST") {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return json({ error: "Загрузка отключена: на сервере не задан пароль ADMIN_PASSWORD." }, 503);
    if (!samePassword(req.headers.get("x-admin-password"), password)) return json({ error: "Неверный пароль." }, 401);

    let body;
    try { body = await req.json(); } catch { return json({ error: "Ожидается JSON." }, 400); }
    const { rows, error } = validate(body);
    if (error) return json({ error }, 400);

    const updatedAt = new Date().toISOString();
    const table = { updatedAt, source: clean(body.source, 200) || "Загружено", rows };
    const previous = await store.get("current", { type: "json" });
    if (previous) await store.setJSON(`history/${previous.updatedAt || updatedAt}`, previous);
    await store.setJSON("current", table);
    return json({ ok: true, updatedAt, count: rows.length });
  }

  return json({ error: "Метод не поддерживается." }, 405);
};

export const config = { path: "/api/table" };
