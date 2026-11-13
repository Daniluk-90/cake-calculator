// Логика поиска аналогов — общая для сайта и программ Windows/Mac.
(function (root) {
  "use strict";

  /** Убирает пробелы, дефисы, точки и т.п., приводит к верхнему регистру. */
  function normalize(s) {
    return String(s == null ? "" : s).toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
  }

  function prettyBrand(b) {
    const s = String(b || "").trim();
    return normalize(s) === "MEANWELL" ? "Mean Well" : s;
  }

  function isNoAnalog(t) {
    const n = normalize(t);
    return n === "" || n === "НЕТ" || n === "NO" || n === "NONE";
  }

  /** Варианты артикула: целиком и по частям («MDR-20-24 / SQ0752-0008», «IP-502 52052DEK (ИП502-1Н24)»). */
  function keysOf(model) {
    const keys = [normalize(model)];
    for (const part of String(model).split(/[\/(),;]/)) {
      const t = part.trim();
      if (!t) continue;
      keys.push(normalize(t));
      const words = t.split(/\s+/);
      const last = words[words.length - 1];
      if (words.length > 1 && /\d/.test(last)) keys.push(normalize(last));
    }
    return [...new Set(keys.filter((k) => k.length >= 3))];
  }

  class AnalogTable {
    constructor(data) {
      const seen = new Set();
      this.rows = [];
      for (const r of (data && data.rows) || []) {
        const row = {
          brand: prettyBrand(r.brand),
          model: String(r.model || "").trim(),
          tetta: String(r.tetta || "").trim() || "Нет",
          result: String(r.result || "").trim(),
          conditions: String(r.conditions || "").trim(),
        };
        if (!row.brand || !row.model) continue;
        const k = row.brand + "|" + normalize(row.model) + "|" + normalize(row.tetta);
        if (seen.has(k)) continue;
        seen.add(k);
        row.noAnalog = isNoAnalog(row.tetta);
        row.keys = keysOf(row.model);
        row.nModel = normalize(row.model);
        row.nTetta = normalize(row.tetta);
        this.rows.push(row);
      }
      this.brands = [...new Set(this.rows.map((r) => r.brand))];
      this.updatedAt = data && data.updatedAt;
      this.source = data && data.source;
    }

    /** Точное совпадение → обратный поиск по артикулу TETTAPRO → частичное совпадение. */
    search(query, brand) {
      const q = normalize(query);
      const res = { query, exact: false, reverse: false, matches: [] };
      if (!q) return res;
      const pool = brand ? this.rows.filter((r) => r.brand === brand) : this.rows;

      let m = pool.filter((r) => r.keys.includes(q));
      if (m.length) return Object.assign(res, { exact: true, matches: m });

      m = pool.filter((r) => !r.noAnalog && r.nTetta === q);
      if (m.length) return Object.assign(res, { exact: true, reverse: true, matches: m });

      res.matches = pool
        .filter((r) => r.nModel.includes(q) || (!r.noAnalog && r.nTetta.includes(q)))
        .sort((a, b) => (a.nModel.startsWith(q) ? 0 : 1) - (b.nModel.startsWith(q) ? 0 : 1) || a.model.localeCompare(b.model));
      return res;
    }
  }

  /** Чтение листа Excel (через SheetJS): ищет строку заголовков «Бренд | Модель / артикул | Кандидат TETTAPRO …». */
  function rowsFromSheet(aoa) {
    for (let i = 0; i < aoa.length; i++) {
      const cols = { brand: -1, model: -1, tetta: -1, result: -1, conditions: -1 };
      (aoa[i] || []).forEach((cell, c) => {
        const n = normalize(cell);
        if (n === "БРЕНД") cols.brand = c;
        else if (n.startsWith("МОДЕЛЬ") || n === "АРТИКУЛ") cols.model = c;
        else if (n.includes("TETTAPRO")) cols.tetta = c;
        else if (n === "РЕЗУЛЬТАТПОДБОРА") cols.result = c;
        else if (n.startsWith("ОТЛИЧИЯ")) cols.conditions = c;
      });
      if (cols.brand < 0 || cols.model < 0 || cols.tetta < 0) continue;
      const get = (row, c) => (c >= 0 && row[c] != null ? String(row[c]).trim() : "");
      const rows = [];
      for (const row of aoa.slice(i + 1)) {
        if (!row) continue;
        const r = { brand: get(row, cols.brand), model: get(row, cols.model), tetta: get(row, cols.tetta),
                    result: get(row, cols.result), conditions: get(row, cols.conditions) };
        if (r.brand && r.model) rows.push(r);
      }
      return rows;
    }
    throw new Error("В файле не найдены столбцы «Бренд», «Модель / артикул», «Кандидат TETTAPRO».");
  }

  root.Analogs = { normalize, AnalogTable, rowsFromSheet, keysOf };
  if (typeof module !== "undefined") module.exports = root.Analogs;
})(typeof window !== "undefined" ? window : globalThis);
