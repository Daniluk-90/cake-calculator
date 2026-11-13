// Подбор аналогов TETTAPRO: один и тот же код работает на сайте и в программах Windows/Mac.
(function () {
  "use strict";

  const EMAIL = "sales@mechatronics.ru";
  const CACHE_KEY = "tettapro.table";
  const SERVER_KEY = "tettapro.server";
  const PASS_KEY = "tettapro.password";
  const REFRESH_MS = 5 * 60 * 1000;
  const cfg = window.TETTA_CONFIG || {};
  const isDesktop = !!cfg.desktop || location.protocol === "file:";

  const $ = (id) => document.getElementById(id);
  const els = {
    form: $("form"), brand: $("brand"), brandHint: $("brandHint"), article: $("article"), list: $("articles"),
    result: $("result"), caption: $("resCaption"), value: $("resValue"), note: $("resNote"), details: $("resDetails"),
    copy: $("copy"), tableBlock: $("tableBlock"), tbody: document.querySelector("#table tbody"), status: $("status"),
  };

  let table = new Analogs.AnalogTable({ rows: [] });
  let online = false;
  let copyText = "";
  let brandAuto = false; // бренд выбран программой, а не пользователем

  // ---------- хранилище ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* приватный режим */ } },
  };

  function apiUrl() {
    const base = (store.get(SERVER_KEY) || cfg.apiBase || "").replace(/\/+$/, "");
    if (!base && isDesktop) return null;
    return base + "/api/table";
  }

  // ---------- загрузка таблицы ----------
  function useTable(data, persist) {
    const keepQuery = els.article.value;
    table = new Analogs.AnalogTable(data);
    if (persist) store.set(CACHE_KEY, JSON.stringify(data));
    fillBrands();
    fillDatalist();
    renderStatus();
    if (keepQuery.trim()) runSearch(false);
  }

  async function loadDefault() {
    return window.TETTA_DEFAULT_TABLE || { rows: [] };
  }

  async function refresh() {
    const url = apiUrl();
    if (!url) { online = false; renderStatus(); return; }
    try {
      const r = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
      if (r.status === 404) {
        online = true;
        if (!table.rows.length) useTable(await loadDefault(), false);
        renderStatus();
        return;
      }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      online = true;
      if (data.updatedAt !== table.updatedAt || !table.rows.length) useTable(data, true);
      else renderStatus();
    } catch (e) {
      online = false;
      renderStatus();
    }
  }

  async function start() {
    const cached = store.get(CACHE_KEY);
    if (cached) { try { useTable(JSON.parse(cached), false); } catch { /* повреждён — игнорируем */ } }
    if (!table.rows.length) { try { useTable(await loadDefault(), false); } catch { /* нет файла */ } }
    await refresh();
    setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function renderStatus() {
    const parts = [`База: ${table.rows.length} позиций, брендов: ${table.brands.length}`];
    const d = fmtDate(table.updatedAt);
    if (d) parts.push("обновлено " + d);
    els.status.innerHTML = "";
    const dot = document.createElement("span");
    dot.className = "dot" + (online ? "" : " off");
    dot.title = online ? "Связь с сервером есть — таблица общая" : "Нет связи с сервером — показана сохранённая таблица";
    els.status.append(dot, parts.join(" · ") + (online ? "" : " · нет связи с сервером"));
  }

  function fillBrands() {
    const current = els.brand.value;
    els.brand.length = 1;
    for (const b of table.brands) els.brand.add(new Option(b, b));
    els.brand.value = table.brands.includes(current) ? current : "";
  }

  function fillDatalist() {
    const seen = new Set();
    els.list.innerHTML = "";
    for (const r of table.rows) {
      for (const v of [r.model, r.noAnalog ? null : r.tetta]) {
        if (!v || seen.has(v)) continue;
        seen.add(v);
        const o = document.createElement("option");
        o.value = v;
        els.list.append(o);
      }
    }
  }

  // ---------- поиск ----------
  function setBrand(brand, hint) {
    els.brand.value = brand;
    els.brandHint.textContent = hint || "";
    brandAuto = true;
  }

  function detectBrand() {
    const q = els.article.value.trim();
    if (!q) { els.brandHint.textContent = ""; resetView(); return; }
    const r = table.search(q, null);
    if (!r.exact || r.reverse) {
      if (brandAuto) setBrand("", "");   // сбрасываем бренд, подобранный для предыдущего артикула
      return;
    }
    const brands = [...new Set(r.matches.map((m) => m.brand))];
    setBrand(brands.length === 1 ? brands[0] : "", brands.length === 1 ? "· определён автоматически" : "· у нескольких брендов");
  }

  function resetView() {
    els.result.hidden = true;
    els.tableBlock.hidden = true;
  }

  const join = (arr) => [...new Set(arr.map((s) => (s || "").trim()).filter(Boolean))];

  function showResult(kind, caption, value, note, details, copy) {
    els.result.hidden = false;
    els.result.className = "card result" + (kind === "warn" ? " is-warn" : kind === "neutral" ? " is-neutral" : "");
    els.caption.textContent = caption;
    els.value.textContent = value;
    els.note.textContent = note || "";
    els.details.textContent = details || "";
    els.details.hidden = !details;
    copyText = copy || "";
    els.copy.hidden = !copy;
    els.copy.textContent = "Копировать";
  }

  function fillTable(rows) {
    els.tbody.innerHTML = "";
    for (const r of rows) {
      const tr = document.createElement("tr");
      const cells = [
        ["Бренд", r.brand, ""], ["Артикул конкурента", r.model, ""],
        ["Аналог TETTAPRO", r.noAnalog ? "Нет аналога" : r.tetta, r.noAnalog ? "tetta none" : "tetta"],
        ["Результат подбора", r.result, "result-col"], ["Отличия и условия замены", r.conditions, ""],
      ];
      for (const [label, text, cls] of cells) {
        const td = document.createElement("td");
        td.textContent = text || "";
        td.dataset.label = label;
        if (cls) td.className = cls;
        tr.append(td);
      }
      tr.addEventListener("click", () => {
        els.tbody.querySelectorAll("tr.is-active").forEach((x) => x.classList.remove("is-active"));
        tr.classList.add("is-active");
        if (!els.result.hidden && r.conditions) {
          els.details.textContent = `${r.brand} ${r.model} → ${r.noAnalog ? "нет аналога" : r.tetta}. Отличия и условия замены: ${r.conditions}`;
          els.details.hidden = false;
        }
      });
      els.tbody.append(tr);
    }
    els.tableBlock.hidden = rows.length === 0;
  }

  function runSearch(autoBrand) {
    const q = els.article.value.trim();
    if (!q) { resetView(); return; }

    let brand = els.brand.value || null;
    let r = table.search(q, brand);
    if (!r.matches.length && brand && autoBrand !== false) {
      const all = table.search(q, null);
      if (all.matches.length) {
        const brands = [...new Set(all.matches.map((m) => m.brand))];
        setBrand(brands.length === 1 ? brands[0] : "", brands.length === 1 ? "· определён автоматически" : "");
        r = table.search(q, els.brand.value || null);
      }
    }

    if (!r.matches.length) {
      fillTable([]);
      showResult("warn", "Не найдено", `Аналог для «${q}» не найден`,
        `Проверьте артикул или напишите нам на почту ${EMAIL} для уточнения замены.`);
      return;
    }

    if (r.matches.every((m) => m.noAnalog) && (r.exact || r.matches.length === 1)) {
      const m0 = r.matches[0];
      const info = join(r.matches.map((m) => m.result)).join("; ");
      const cond = join(r.matches.map((m) => m.conditions)).join(" ");
      fillTable([]);
      showResult("warn", `Аналог TETTAPRO для ${m0.brand} ${m0.model}`,
        "Аналога TETTAPRO нет" + (info ? " — " + info.toLowerCase() : ""),
        cond || `Напишите нам на почту ${EMAIL} для уточнения замены.`,
        cond ? `Напишите нам на почту ${EMAIL} для уточнения замены.` : "");
      return;
    }

    fillTable(r.matches);
    const found = r.matches.filter((m) => !m.noAnalog);
    const analogs = join(found.map((m) => m.tetta));

    if (r.exact && !r.reverse) {
      const brands = join(r.matches.map((m) => m.brand));
      const src = r.matches[0];
      if (brands.length > 1) {
        const same = analogs.length === 1 && found.length === r.matches.length;
        showResult("ok", `Аналог TETTAPRO для ${src.model}`, analogs.join("  /  "),
          same ? `Артикул есть у брендов: ${brands.join(", ")}. Нажмите на строку таблицы, чтобы увидеть условия замены.`
               : `Аналог зависит от бренда (${brands.join(", ")}) — выберите бренд или нажмите на строку таблицы.`,
          "", same ? analogs.join(", ") : "");
      } else {
        const info = join(found.map((m) => m.result)).join("; ");
        const cond = join(found.map((m) => m.conditions)).join(" ");
        showResult("ok", `Аналог TETTAPRO для ${src.brand} ${src.model}`, analogs.join("  /  "),
          info ? "Результат подбора: " + info : "Нажмите «Копировать», чтобы вставить артикул в заказ",
          cond ? "Отличия и условия замены: " + cond : "", analogs.join(", "));
      }
    } else if (r.exact && r.reverse) {
      const models = join(r.matches.map((m) => m.model));
      showResult("ok", `Артикул TETTAPRO ${r.matches[0].tetta} заменяет`,
        models.length <= 3 ? models.join("  /  ") : `Моделей: ${models.length}`,
        "Это артикул TETTAPRO — модели, которые он заменяет, показаны в таблице ниже");
    } else if (r.matches.length === 1) {
      const one = r.matches[0];
      showResult("ok", "Похожий артикул", one.noAnalog ? "Аналога TETTAPRO нет" : one.tetta,
        `Ближайшее совпадение: ${one.brand} ${one.model}` + (one.result ? " · " + one.result : ""),
        one.conditions ? "Отличия и условия замены: " + one.conditions : "", one.noAnalog ? "" : one.tetta);
    } else {
      showResult("neutral", "Похожие артикулы", `Найдено вариантов: ${r.matches.length}`,
        "Точного совпадения нет — выберите нужную строку в таблице ниже");
    }
  }

  // ---------- копирование / сообщения ----------
  let toastTimer;
  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.append(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* нет доступа */ }
      ta.remove();
    }
  }

  // ---------- загрузка / скачивание таблицы ----------
  let pendingRows = null, pendingName = "";

  function openUpload() {
    pendingRows = null;
    $("uploadFile").value = "";
    $("uploadInfo").textContent = "";
    $("uploadError").hidden = true;
    $("uploadSend").disabled = true;
    const saved = store.get(PASS_KEY);
    $("uploadPassword").value = saved || "";
    $("uploadRemember").checked = !!saved;
    if (!apiUrl()) {
      $("uploadError").textContent = "Не указан адрес сервера. Нажмите «Сервер…» внизу окна.";
      $("uploadError").hidden = false;
    }
    $("uploadDialog").showModal();
  }

  async function readFile(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    // Берём лист «Подбор», если он есть, иначе первый подходящий.
    const names = wb.SheetNames.slice().sort((a, b) => (b === "Подбор") - (a === "Подбор"));
    let lastErr;
    for (const n of names) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: "" });
      try { return Analogs.rowsFromSheet(aoa); } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("Пустой файл.");
  }

  async function onFile() {
    const f = $("uploadFile").files[0];
    $("uploadError").hidden = true;
    pendingRows = null;
    $("uploadSend").disabled = true;
    if (!f) return;
    try {
      const rows = await readFile(f);
      const t = new Analogs.AnalogTable({ rows });
      pendingRows = rows;
      pendingName = f.name;
      $("uploadInfo").textContent = `В файле ${t.rows.length} позиций, брендов: ${t.brands.length}.`;
      $("uploadSend").disabled = !apiUrl();
    } catch (e) {
      $("uploadError").textContent = e.message;
      $("uploadError").hidden = false;
    }
  }

  async function sendUpload() {
    const url = apiUrl();
    const pass = $("uploadPassword").value;
    if (!pendingRows || !url) return;
    $("uploadSend").disabled = true;
    $("uploadError").hidden = true;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Password": pass },
        body: JSON.stringify({ source: pendingName, rows: pendingRows }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Ошибка сервера " + r.status);
      store.set(PASS_KEY, $("uploadRemember").checked ? pass : null);
      $("uploadDialog").close();
      await refresh();
      toast(`Таблица загружена: ${data.count} позиций. Она уже действует на сайте и во всех программах.`);
    } catch (e) {
      $("uploadError").textContent = e.message === "Failed to fetch" ? "Нет связи с сервером." : e.message;
      $("uploadError").hidden = false;
      $("uploadSend").disabled = false;
    }
  }

  function download() {
    const header = ["Бренд", "Модель / артикул", "Кандидат TETTAPRO", "Результат подбора", "Отличия и условия замены"];
    const aoa = [header, ...table.rows.map((r) => [r.brand, r.model, r.tetta, r.result, r.conditions])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 20 }, { wch: 32 }, { wch: 18 }, { wch: 34 }, { wch: 80 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Подбор");
    const d = table.updatedAt ? new Date(table.updatedAt).toISOString().slice(0, 10) : "";
    XLSX.writeFile(wb, `TETTAPRO-analogs${d ? "-" + d : ""}.xlsx`);
  }

  // ---------- события ----------
  els.form.addEventListener("submit", (e) => { e.preventDefault(); runSearch(true); });
  els.article.addEventListener("input", detectBrand);
  els.brand.addEventListener("change", () => { els.brandHint.textContent = ""; brandAuto = false; if (els.article.value.trim()) runSearch(false); });
  els.copy.addEventListener("click", async () => { await copy(copyText); els.copy.textContent = "Скопировано ✓"; });
  els.tbody.addEventListener("dblclick", async (e) => {
    const td = e.target.closest("tr")?.querySelector("td.tetta:not(.none)");
    if (td) { await copy(td.textContent); toast("Скопировано: " + td.textContent); }
  });

  $("uploadOpen").addEventListener("click", openUpload);
  $("uploadFile").addEventListener("change", onFile);
  $("uploadSend").addEventListener("click", sendUpload);
  $("uploadCancel").addEventListener("click", () => $("uploadDialog").close());
  $("download").addEventListener("click", download);

  if (isDesktop) {
    $("serverOpen").hidden = false;
    $("serverOpen").addEventListener("click", () => {
      $("serverUrl").value = store.get(SERVER_KEY) || cfg.apiBase || "";
      $("serverDialog").showModal();
    });
    $("serverCancel").addEventListener("click", () => $("serverDialog").close());
    $("serverSave").addEventListener("click", () => {
      const v = $("serverUrl").value.trim();
      store.set(SERVER_KEY, v && v !== cfg.apiBase ? v : null);
      $("serverDialog").close();
      refresh();
    });
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  start();
})();
