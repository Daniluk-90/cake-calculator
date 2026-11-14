/* Система подбора аналогов TETTAPRO — интерфейс */
(function () {
  "use strict";
  var CFG = window.TETTA_CONFIG || {};
  var engine = new window.TettaEngine(window.TETTA_DB, CFG);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var params = new URLSearchParams(location.search);
  var STORE = "tettapro-analogs-picked-v1";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) { return n == null ? "—" : String(n).replace(".", ","); }
  function mailto(to, subject, body) {
    return "mailto:" + to + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body || "");
  }
  function toast(text, kind) {
    var t = document.createElement("div");
    t.className = "toast" + (kind ? " toast-" + kind : "");
    t.textContent = text;
    $("#toasts").appendChild(t);
    setTimeout(function () { t.classList.add("out"); }, 3200);
    setTimeout(function () { t.remove(); }, 3700);
  }
  function track(event, data) {
    // Хук для Яндекс.Метрики / GTM на вашем сайте: window.dataLayer или ym
    try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: "analogs_" + event }, data || {})); } catch (e) {}
  }

  /* ---------- Режим встраивания ---------- */
  if (params.get("embed") === "1") document.documentElement.classList.add("embed");

  /* ---------- Состояние ---------- */
  var state = {
    mode: params.get("mode") === "batch" ? "batch" : "single",
    query: "",
    ref: null,            // выбранный референс (после «Подобрать»)
    selLine: null,        // выбранная серия
    selRef: null,         // выбранный продукт в серии
    result: null,         // результат подбора
    optionIndex: 0,
    qty: 1,
    confirmed: false,
    picked: load()
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { return []; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state.picked)); } catch (e) {}
  }

  /* ---------- Переключение режимов ---------- */
  function setMode(m) {
    state.mode = m;
    $$(".mode-btn").forEach(function (b) {
      var on = b.dataset.mode === m;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on);
    });
    $("#view-single").hidden = m !== "single";
    $("#view-batch").hidden = m !== "batch";
    $("#picked").hidden = m !== "single";
    $("#app").classList.toggle("is-batch", m === "batch");
    if (m === "batch") renderBatch();
  }
  $$(".mode-btn").forEach(function (b) { b.addEventListener("click", function () { setMode(b.dataset.mode); }); });

  /* ---------- Поиск ---------- */
  var input = $("#search"), dd = $("#search-dropdown"), activeIdx = -1, ddItems = [];
  var GROUPS = { ref: "Референсы", line: "Серия", desc: "Наименование" };

  function renderDropdown() {
    var q = input.value.trim();
    $("#clear-btn").hidden = !input.value;
    ddItems = [];
    activeIdx = -1;
    if (!q) { closeDD(); return; }
    var html = "";
    if (TettaEngine.norm(q).length < 2) {
      html = '<div class="dd-empty">Введите хотя бы два символа для поиска.</div>';
    } else {
      var own = engine.findProduct(q);
      var r = engine.search(q);
      if (own) {
        html += '<div class="dd-group">TETTAPRO</div>';
        html += item({ type: "own", value: own.article }, esc(own.article), esc(own.name));
      }
      ["ref", "line", "desc"].forEach(function (g) {
        if (!r[g].length) return;
        html += '<div class="dd-group">' + GROUPS[g] + "</div>";
        r[g].forEach(function (x) {
          if (g === "line") html += item({ type: "line", value: x.key }, hl(x.series, q), esc(x.manufacturer) + " · " + x.items.length + " поз.");
          else html += item({ type: "ref", value: x.article }, g === "ref" ? hl(x.article, q) : esc(x.article), (g === "desc" ? hl(x.name, q) : esc(x.name)) + " · " + esc(x.manufacturer));
        });
      });
      if (!html) html = '<div class="dd-empty">К сожалению, мы не нашли позиции по вашему запросу.<br><a data-mail="support">Написать в поддержку</a></div>';
    }
    dd.innerHTML = html;
    dd.hidden = false;
    input.setAttribute("aria-expanded", "true");
    ddItems = $$(".dd-item", dd);
  }
  function item(data, title, sub) {
    var i = ddItems.length; ddItems.push(1);
    return '<button type="button" class="dd-item" role="option" data-type="' + data.type + '" data-value="' + esc(data.value) + '" id="dd-' + i + '">' +
      '<span class="dd-title">' + title + '</span><span class="dd-sub">' + sub + "</span></button>";
  }
  function hl(text, q) {
    var t = esc(text), nq = q.trim();
    if (!nq) return t;
    var i = String(text).toLowerCase().indexOf(nq.toLowerCase());
    if (i === -1) return t;
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + nq.length)) + "</mark>" + esc(text.slice(i + nq.length));
  }
  function closeDD() { dd.hidden = true; input.setAttribute("aria-expanded", "false"); }

  var debounce;
  input.addEventListener("input", function () { clearTimeout(debounce); debounce = setTimeout(renderDropdown, 120); });
  input.addEventListener("focus", function () { if (input.value.trim()) renderDropdown(); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (dd.hidden || activeIdx === -1)) {
      e.preventDefault();
      clearTimeout(debounce);
      renderDropdown();
      var all = $$(".dd-item", dd);
      var hit = exactItem(all) || (all.length === 1 ? all[0] : null);
      if (hit) hit.click();
      return;
    }
    if (dd.hidden) return;
    var items = $$(".dd-item", dd);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = (activeIdx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach(function (x, i) { x.classList.toggle("is-active", i === activeIdx); });
      if (items[activeIdx]) { items[activeIdx].scrollIntoView({ block: "nearest" }); input.setAttribute("aria-activedescendant", items[activeIdx].id); }
    } else if (e.key === "Enter") {
      e.preventDefault();
      var pick = items[activeIdx] || (items.length === 1 ? items[0] : null) || exactItem(items);
      if (pick) pick.click();
    } else if (e.key === "Escape") closeDD();
  });
  function exactItem(items) {
    var nq = TettaEngine.norm(input.value);
    return items.filter(function (x) { return x.dataset.type !== "line" && TettaEngine.norm(x.dataset.value) === nq; })[0] || null;
  }
  dd.addEventListener("click", function (e) {
    var b = e.target.closest(".dd-item");
    if (!b) return;
    closeDD();
    if (b.dataset.type === "line") selectLine(b.dataset.value);
    else if (b.dataset.type === "own") showOwn(engine.findProduct(b.dataset.value));
    else selectRef(engine.findRef(b.dataset.value));
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#search-box")) { closeDD(); $("#hint-pop").hidden = true; }
  });
  $("#hint-btn").addEventListener("click", function () { $("#hint-pop").hidden = !$("#hint-pop").hidden; });
  $("#clear-btn").addEventListener("click", function () { resetSingle(); input.focus(); });

  function resetSingle() {
    input.value = "";
    $("#clear-btn").hidden = true;
    closeDD();
    state.ref = state.selLine = state.selRef = state.result = null;
    state.confirmed = false;
    $("#ref-panel").hidden = true;
    renderAnalog();
  }

  /* ---------- Выбор референса ---------- */
  function selectRef(ref) {
    if (!ref) return;
    track("select_ref", { reference: ref.article });
    input.value = ref.article;
    $("#clear-btn").hidden = false;
    state.selLine = engine.lineOf(ref);
    state.selRef = ref;
    state.ref = null; state.result = null; state.confirmed = false;
    renderRefPanel();
    renderAnalog();
  }
  function selectLine(key) {
    var line = engine.lines.filter(function (l) { return l.key === key; })[0];
    if (!line) return;
    input.value = line.series;
    $("#clear-btn").hidden = false;
    state.selLine = line;
    state.selRef = line.items.length === 1 ? line.items[0] : null;
    state.ref = null; state.result = null; state.confirmed = false;
    renderRefPanel();
    renderAnalog();
  }
  function showOwn(p) {
    state.ref = null; state.selLine = null; state.selRef = null; state.result = { own: p };
    $("#ref-panel").hidden = true;
    renderAnalog();
  }

  function renderRefPanel() {
    var panel = $("#ref-panel"), line = state.selLine, r = state.selRef;
    var lineOpts = engine.lines.map(function (l) {
      return '<option value="' + esc(l.key) + '"' + (line && l.key === line.key ? " selected" : "") + ">" + esc(l.series) + " — " + esc(l.manufacturer) + "</option>";
    }).join("");
    var prodOpts = line ? line.items.map(function (x) {
      return '<option value="' + esc(x.article) + '"' + (r && x.id === r.id ? " selected" : "") + ">" + esc(x.article) + " — " + esc(x.name) + "</option>";
    }).join("") : "";
    panel.innerHTML =
      '<label class="field"><span>Серия</span><select id="sel-line"><option value="" disabled' + (line ? "" : " selected") + ">Выберите серию</option>" + lineOpts + "</select></label>" +
      '<label class="field"><span>Релевантный продукт</span><select id="sel-ref"' + (line ? "" : " disabled") + '><option value="" disabled' + (r ? "" : " selected") + ">" + (line && line.items.length ? "Выберите продукт" : "Продукты отсутствуют") + "</option>" + prodOpts + "</select></label>" +
      (r ? '<dl class="ref-info">' +
        "<div><dt>Артикул:</dt><dd>" + esc(r.article) + "</dd></div>" +
        "<div><dt>Наименование:</dt><dd>" + esc(r.name) + "</dd></div>" +
        "<div><dt>Серия:</dt><dd>" + esc(r.series) + "</dd></div>" +
        "<div><dt>Производитель:</dt><dd>" + esc(r.manufacturer) + "</dd></div>" +
        "<div><dt>Параметры:</dt><dd>" + fmt(r.power) + " Вт · " + fmt(r.voltage) + " В · " + fmt(r.current) + " А</dd></div>" +
        "</dl>" : (line ? '<p class="muted small">Выберите продукт из серии, чтобы подобрать аналог.</p>' : "")) +
      '<div class="ref-actions">' +
      '<label class="field qty-field"><span>Количество</span>' + stepper("ref-qty", state.qty) + "</label>" +
      '<button class="btn btn-primary" id="do-match" type="button"' + (r ? "" : " disabled") + ">Подобрать</button>" +
      '<button class="btn btn-ghost" id="new-search" type="button">Новый поиск</button></div>';
    panel.hidden = false;

    $("#sel-line").addEventListener("change", function (e) { selectLine(e.target.value); });
    $("#sel-ref").addEventListener("change", function (e) { selectRef(engine.findRef(e.target.value)); });
    bindStepper(panel, "ref-qty", function (v) { state.qty = v; });
    $("#do-match").addEventListener("click", doMatch);
    $("#new-search").addEventListener("click", function () { resetSingle(); input.focus(); });
  }

  function stepper(id, v) {
    return '<span class="stepper" data-stepper="' + id + '"><button type="button" data-d="-1" aria-label="Меньше">−</button>' +
      '<input type="number" min="1" max="99999" value="' + v + '" inputmode="numeric" aria-label="Количество"><button type="button" data-d="1" aria-label="Больше">+</button></span>';
  }
  function bindStepper(root, id, cb) {
    var s = $('[data-stepper="' + id + '"]', root);
    if (!s) return;
    var inp = $("input", s);
    function set(v) { v = Math.max(1, Math.min(99999, parseInt(v, 10) || 1)); inp.value = v; cb(v); }
    $$("button", s).forEach(function (b) { b.addEventListener("click", function () { set((parseInt(inp.value, 10) || 1) + +b.dataset.d); }); });
    inp.addEventListener("change", function () { set(inp.value); });
  }

  /* ---------- Подбор ---------- */
  function doMatch() {
    if (!state.selRef) return;
    state.ref = state.selRef;
    state.result = engine.analogsFor(state.ref);
    state.optionIndex = 0;
    state.confirmed = false;
    track("search_click", { reference: state.ref.article, found: state.result.options.length });
    renderAnalog();
    if (window.innerWidth < 1100) $("#analog-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function productCard(p, qty, ref) {
    var cmp = ref ? '<table class="cmp"><thead><tr><th></th><th>' + esc(ref.article) + "</th><th>" + esc(p.article) + "</th></tr></thead><tbody>" +
      row("Мощность", fmt(ref.power) + " Вт", fmt(p.power) + " Вт", p.power >= ref.power) +
      row("Выходное напряжение", fmt(ref.voltage) + " В DC", fmt(p.voltage) + " В DC", p.voltage === ref.voltage) +
      row("Выходной ток", fmt(ref.current) + " А", fmt(p.current) + " А", !ref.current || p.current >= ref.current) +
      "</tbody></table>" : "";
    return '<div class="product">' +
      '<div class="product-img"><img src="' + esc(p.image) + '" alt="' + esc(p.article) + '" loading="lazy"></div>' +
      '<div class="product-body">' +
      '<div class="product-series">' + esc(p.series) + " SERIES</div>" +
      '<div class="product-article">' + esc(p.article) + (qty > 1 ? ' <span class="x">× ' + qty + "</span>" : "") + "</div>" +
      '<div class="product-name">' + esc(p.name) + "</div>" +
      '<div class="specs">' +
      spec("Мощность", fmt(p.power) + " Вт") + spec("Выход", fmt(p.voltage) + " В DC / " + fmt(p.current) + " А") +
      spec("Вход", p.input) + spec("КПД", p.efficiency) + spec("Габариты (Ш×В×Г)", p.size) + spec("Рабочая температура", p.temp) +
      spec("Гарантия", p.warranty) + "</div>" + cmp +
      "</div></div>";
  }
  function spec(k, v) { return v ? '<div class="spec"><span>' + k + "</span><b>" + esc(v) + "</b></div>" : ""; }
  function row(k, a, b, ok) { return "<tr><td>" + k + "</td><td>" + esc(a) + '</td><td class="' + (ok ? "ok" : "warn") + '">' + esc(b) + "</td></tr>"; }

  function renderAnalog() {
    var panel = $("#analog-panel"), res = state.result, ref = state.ref;
    var head = '<h2 class="panel-title">Рекомендованная замена</h2>';
    panel.classList.toggle("is-empty", !res);
    if (!res) {
      panel.innerHTML = head + '<div class="placeholder"><img src="assets/img/theta.svg" alt="" class="ph-theta">Начните поиск и здесь появятся варианты замены</div>';
      return;
    }
    if (res.own) {
      var p = res.own;
      panel.innerHTML = head + '<p class="note">Это оборудование TETTAPRO — замена не требуется.</p>' + productCard(p, 1) +
        '<div class="analog-actions"><a class="btn btn-primary" href="' + esc(p.url) + '" target="_blank" rel="noopener">Подробнее о модели</a>' +
        '<a class="btn btn-ghost" href="' + esc(buyLink([{ product: p, qty: 1 }], 1)) + '">Купить</a></div>';
      return;
    }
    if (!res.options.length) {
      panel.innerHTML = head + '<div class="not-found"><b>К сожалению, мы не нашли доступный аналог для данной позиции.</b>' +
        (res.reason ? "<p>" + esc(res.reason) + ".</p>" : "") +
        '<p>Пожалуйста, обратитесь за консультацией по адресу <a href="' + esc(mailto(CFG.supportEmail, "Подбор аналога: " + ref.article, "Здравствуйте! Прошу подобрать аналог TETTAPRO для: " + ref.article + " (" + ref.manufacturer + "), " + ref.name + ".\nКоличество: " + state.qty + " шт.")) + '">' + esc(CFG.supportEmail) + "</a></p></div>" +
        '<div class="analog-actions"><button class="btn btn-ghost" id="again" type="button">Новый подбор</button></div>';
      $("#again").addEventListener("click", function () { resetSingle(); input.focus(); });
      return;
    }

    var multi = res.options.length > 1;
    var html = head + '<div class="ref-line">Замена для <b>' + esc(ref.article) + "</b> · " + esc(ref.manufacturer) + " · " + state.qty + " шт</div>";
    if (multi && !state.confirmed) {
      html += '<p class="note">Для данного референса доступно несколько аналогов.<br>Пожалуйста, выберите подходящий вам вариант.</p><div class="tabs" role="tablist">';
      res.options.forEach(function (o, i) {
        html += '<button type="button" role="tab" class="tab' + (i === state.optionIndex ? " is-active" : "") + '" data-opt="' + i + '">Выбрать аналог ' + (i + 1) +
          '<small>' + esc(o.items.map(function (x) { return x.product.article; }).join(" + ")) + (o.note ? " · " + esc(o.note) : "") + "</small></button>";
      });
      html += "</div>";
    }
    var opt = res.options[state.optionIndex];
    if (opt.items.length > 1) html += '<p class="note">Аналог состоит из нескольких позиций</p>';
    else if (!multi && opt.note) html += '<p class="note small">' + esc(opt.note) + "</p>";
    opt.items.forEach(function (x) { html += productCard(x.product, x.qty, opt.items.length === 1 ? ref : null); });

    var buy = buyLink(opt.items, state.qty);
    html += '<div class="analog-actions">';
    if (state.confirmed) {
      html += '<span class="done">✓ Добавлено в «Подобранное»</span><button class="btn btn-primary" id="again" type="button">Новый подбор</button>';
    } else {
      html += '<button class="btn btn-primary" id="confirm" type="button">' + (multi ? "Подтвердить выбор" : "Добавить в подобранное") + "</button>";
    }
    html += '<a class="btn btn-ghost" href="' + esc(buy) + '">' + (opt.items.length > 1 ? "Купить все" : "Купить") + "</a>" +
      '<a class="btn btn-link" href="' + esc(opt.items[0].product.url) + '" target="_blank" rel="noopener">Характеристики ↗</a></div>';
    panel.innerHTML = html;

    $$(".tab", panel).forEach(function (t) { t.addEventListener("click", function () { state.optionIndex = +t.dataset.opt; renderAnalog(); }); });
    var c = $("#confirm"); if (c) c.addEventListener("click", confirmPick);
    var a = $("#again"); if (a) a.addEventListener("click", function () { resetSingle(); input.focus(); });
  }

  function buyLink(items, qty) {
    var lines = items.map(function (x) { return "• " + x.product.article + " — " + (x.qty * qty) + " шт."; }).join("\n");
    return mailto(CFG.salesEmail, "TETTAPRO — запрос цены", "Здравствуйте! Прошу выставить предложение:\n" + lines + "\n\nКомпания:\nКонтактное лицо:\nТелефон:");
  }

  function confirmPick() {
    var opt = state.result.options[state.optionIndex], ref = state.ref;
    var existing = state.picked.filter(function (p) { return p.ref === ref.article && p.option === opt.items.map(function (x) { return x.product.article; }).join("+"); })[0];
    if (existing) existing.qty += state.qty;
    else state.picked.push({
      ref: ref.article, refName: ref.name, manufacturer: ref.manufacturer, series: ref.series,
      option: opt.items.map(function (x) { return x.product.article; }).join("+"),
      items: opt.items.map(function (x) { return { article: x.product.article, qty: x.qty }; }),
      qty: state.qty
    });
    save();
    state.confirmed = true;
    track("analog_confirm", { reference: ref.article, analog: opt.items[0].product.article });
    renderAnalog();
    renderPicked();
    toast("Аналог добавлен в «Подобранное»");
  }

  /* ---------- Подобранное ---------- */
  function renderPicked() {
    var list = $("#picked-list");
    $("#picked-count").textContent = state.picked.length;
    $("#picked-actions").hidden = !state.picked.length;
    if (!state.picked.length) {
      list.innerHTML = '<p class="muted small picked-empty">Здесь появятся подтверждённые аналоги. Список можно скачать в Excel.</p>';
      return;
    }
    list.innerHTML = state.picked.map(function (p, i) {
      var analog = p.items.map(function (x) { return esc(x.article) + (x.qty > 1 ? " ×" + x.qty : ""); }).join(" + ");
      return '<div class="pick" data-i="' + i + '">' +
        '<div class="pick-top"><div><div class="pick-analog">' + analog + '</div><div class="pick-ref">вместо ' + esc(p.ref) + " · " + esc(p.manufacturer) + "</div></div>" +
        '<button class="icon-btn" data-del="' + i + '" type="button" aria-label="Удалить позицию" title="Удалить из списка"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg></button></div>' +
        stepper("pick-" + i, p.qty) + "</div>";
    }).join("");
    state.picked.forEach(function (p, i) { bindStepper(list, "pick-" + i, function (v) { p.qty = v; save(); }); });
    $$("[data-del]", list).forEach(function (b) {
      b.addEventListener("click", function () { state.picked.splice(+b.dataset.del, 1); save(); renderPicked(); });
    });
  }
  $("#picked-toggle").addEventListener("click", function () {
    var open = $("#picked").classList.toggle("is-collapsed");
    $("#picked-toggle").setAttribute("aria-expanded", String(!open));
  });
  $("#clear-picked").addEventListener("click", function () {
    if (!confirm("Очистить список подобранного?")) return;
    state.picked = []; save(); renderPicked();
  });
  $("#dl-spec").addEventListener("click", function () {
    var rows = [];
    state.picked.forEach(function (p) {
      p.items.forEach(function (x) {
        var pr = engine.findProduct(x.article) || {};
        rows.push({ refArticle: p.ref, refName: p.refName, manufacturer: p.manufacturer, qty: p.qty,
          article: x.article, name: pr.name, aqty: p.qty * x.qty, url: pr.url, comment: p.items.length > 1 ? "Аналог из нескольких позиций" : "" });
      });
    });
    exportSpec(rows, "Спецификация_TETTAPRO_" + today() + ".xlsx");
    track("download_spec", { mode: "single", rows: rows.length });
  });
  $("#buy-all").addEventListener("click", function () {
    var agg = {};
    state.picked.forEach(function (p) { p.items.forEach(function (x) { agg[x.article] = (agg[x.article] || 0) + p.qty * x.qty; }); });
    var lines = Object.keys(agg).map(function (a) { return "• " + a + " — " + agg[a] + " шт."; }).join("\n");
    location.href = mailto(CFG.salesEmail, "TETTAPRO — запрос цены по спецификации", "Здравствуйте! Прошу выставить предложение:\n" + lines + "\n\nСпецификацию Excel прикладываю (кнопка «Скачать спецификацию»).\n\nКомпания:\nКонтактное лицо:\nТелефон:");
  });

  function today() { return new Date().toISOString().slice(0, 10); }

  /* ---------- Экспорт в Excel ---------- */
  function exportSpec(rows, filename, summary) {
    if (!window.XLSX) { toast("Модуль Excel ещё загружается, попробуйте через секунду", "error"); return; }
    var head = ["№", "Референс: артикул", "Референс: наименование", "Производитель", "Кол-во, шт", "Аналог TETTAPRO: артикул", "Аналог: наименование", "Кол-во аналога, шт", "Ссылка", "Комментарий"];
    var aoa = [["Спецификация подбора аналогов TETTAPRO от " + new Date().toLocaleDateString("ru-RU")]];
    if (summary) aoa.push([summary]);
    aoa.push([]);
    aoa.push(head);
    rows.forEach(function (r, i) {
      aoa.push([i + 1, r.refArticle, r.refName || "", r.manufacturer || "", r.qty, r.article || "—", r.name || "", r.article ? r.aqty : "", r.url || "", r.comment || ""]);
    });
    // итог по моделям TETTAPRO
    var agg = {};
    rows.forEach(function (r) { if (r.article) agg[r.article] = (agg[r.article] || 0) + (r.aqty || 0); });
    aoa.push([]);
    aoa.push(["", "Итого к заказу TETTAPRO"]);
    Object.keys(agg).forEach(function (a) { var p = engine.findProduct(a) || {}; aoa.push(["", a, p.name || "", "", agg[a]]); });
    aoa.push([]);
    aoa.push(["", "Запрос цены: " + CFG.salesEmail + " · " + CFG.catalogUrl]);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 5 }, { wch: 22 }, { wch: 46 }, { wch: 18 }, { wch: 10 }, { wch: 22 }, { wch: 46 }, { wch: 12 }, { wch: 40 }, { wch: 36 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Спецификация");
    XLSX.writeFile(wb, filename);
  }

  /* ---------- Пакетный подбор ---------- */
  var batch = { stage: "start", rows: null, file: "", errors: [] };

  function renderBatch() {
    var p = $("#batch-panel"), html = '<h1 class="panel-title">Пакетный подбор аналогов</h1>';
    if (batch.stage === "start" || batch.stage === "error") {
      html += '<p class="panel-sub">Для подбора аналогов по списку артикулов необходимо создать спецификацию в формате .xlsx в соответствии с шаблоном, который вы можете скачать ниже</p>' +
        '<ol class="steps">' +
        '<li><span class="step-n">1</span><div><b>Скачайте шаблон</b><button class="btn btn-ghost" id="dl-template" type="button">Скачать шаблон</button></div></li>' +
        '<li><span class="step-n">2</span><div><b>Внесите ваше оборудование в шаблон</b><p class="muted small">Артикул и количество для каждой позиции. Если артикула нет в базе, укажите мощность и напряжение — подберём по параметрам.</p></div></li>' +
        '<li><span class="step-n">3</span><div><b>Загрузите полученную спецификацию со своего устройства</b>' +
        '<label class="drop" id="drop"><input type="file" id="file" accept=".xlsx,.xls,.csv" hidden>' +
        '<span class="drop-icon">⇪</span><span><b>Загрузить спецификацию</b><br><span class="muted small">Выберите файл на устройстве или перетащите его сюда · .xlsx, .xls</span></span></label></div></li></ol>';
      if (batch.stage === "error") {
        html += '<div class="not-found"><b>Не удалось распознать файл</b><p>' + esc(batch.errors[0] || "Проверьте соответствие структуры данных с файлом шаблона и формат файла") + "</p></div>";
      }
    } else if (batch.stage === "loading") {
      html += '<div class="loading"><span class="spinner"></span>Анализируем файл</div>';
    } else if (batch.stage === "done") {
      var rows = batch.rows, ok = rows.filter(function (r) { return r.article; }).length;
      var pct = rows.length ? Math.round(ok / rows.length * 100) : 0;
      html += '<div class="batch-result"><div class="pct"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" class="pct-bg"/><circle cx="18" cy="18" r="15.9" class="pct-fg" stroke-dasharray="' + pct + ' 100"/></svg><b>' + pct + "%</b></div>" +
        "<div><b>Успешно подобрано " + pct + "% оборудования</b><p class=\"muted small\">" + esc(batch.file) + " · позиций: " + rows.length + " · найдено аналогов: " + ok + "</p>" +
        (ok < rows.length ? '<p class="small">Если у вас остались вопросы по подбору аналогов, обратитесь в <a data-mail="support">службу технической поддержки</a>.</p>' : "") + "</div></div>" +
        '<div class="analog-actions"><button class="btn btn-primary" id="dl-batch" type="button">Скачать спецификацию</button>' +
        '<button class="btn btn-ghost" id="buy-batch" type="button">Купить все</button>' +
        '<button class="btn btn-link" id="batch-new" type="button">Новый подбор</button></div>' +
        '<div class="table-wrap"><table class="result-table"><thead><tr><th>№</th><th>Референс</th><th>Производитель</th><th>Кол-во</th><th>Аналог TETTAPRO</th><th>Кол-во</th><th>Комментарий</th></tr></thead><tbody>' +
        rows.map(function (r, i) {
          return '<tr class="' + (r.article ? "" : "miss") + '"><td>' + (i + 1) + "</td><td><b>" + esc(r.refArticle) + '</b><div class="muted small">' + esc(r.refName || "") + "</div></td><td>" + esc(r.manufacturer || "—") +
            "</td><td>" + r.qty + "</td><td>" + (r.article ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener"><b>' + esc(r.article) + "</b></a>" : "—") + "</td><td>" + (r.article ? r.aqty : "") + '</td><td class="small">' + esc(r.comment || "") + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    p.innerHTML = html;

    var t = $("#dl-template"); if (t) t.addEventListener("click", downloadTemplate);
    var f = $("#file"); if (f) f.addEventListener("change", function () { if (f.files[0]) readFile(f.files[0]); });
    var d = $("#drop");
    if (d) {
      ["dragenter", "dragover"].forEach(function (ev) { d.addEventListener(ev, function (e) { e.preventDefault(); d.classList.add("is-over"); }); });
      ["dragleave", "drop"].forEach(function (ev) { d.addEventListener(ev, function (e) { e.preventDefault(); d.classList.remove("is-over"); }); });
      d.addEventListener("drop", function (e) { var file = e.dataTransfer.files[0]; if (file) readFile(file); });
    }
    var db = $("#dl-batch"); if (db) db.addEventListener("click", function () {
      var ok = batch.rows.filter(function (r) { return r.article; }).length;
      exportSpec(batch.rows, "Пакетный_подбор_TETTAPRO_" + today() + ".xlsx", "Исходный файл: " + batch.file + " · подобрано " + ok + " из " + batch.rows.length);
      track("download_spec", { mode: "batch", rows: batch.rows.length });
    });
    var bb = $("#buy-batch"); if (bb) bb.addEventListener("click", function () {
      var agg = {};
      batch.rows.forEach(function (r) { if (r.article) agg[r.article] = (agg[r.article] || 0) + r.aqty; });
      var lines = Object.keys(agg).map(function (a) { return "• " + a + " — " + agg[a] + " шт."; }).join("\n");
      location.href = mailto(CFG.salesEmail, "TETTAPRO — запрос цены по спецификации", "Здравствуйте! Прошу выставить предложение:\n" + lines + "\n\nКомпания:\nКонтактное лицо:\nТелефон:");
    });
    var bn = $("#batch-new"); if (bn) bn.addEventListener("click", function () { batch = { stage: "start", rows: null, file: "", errors: [] }; renderBatch(); });
  }

  function downloadTemplate() {
    if (!window.XLSX) { toast("Модуль Excel ещё загружается, попробуйте через секунду", "error"); return; }
    var aoa = [
      ["Артикул", "Количество", "Производитель", "Мощность, Вт", "Выходное напряжение, В"],
      ["HDR-60-24", 5, "MEAN WELL", "", ""],
      ["6EP1333-2BA20", 2, "Siemens", "", ""],
      ["ИП-100-24 (пример по параметрам)", 1, "", 100, 24]
    ];
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 34 }, { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 24 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Спецификация");
    XLSX.writeFile(wb, "шаблон_пакетный_подбор.xlsx");
    track("download_template");
  }

  function readFile(file) {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      batch = { stage: "error", errors: ["Пожалуйста, загрузите файл в формате Excel (.xls или .xlsx)."] }; renderBatch(); return;
    }
    if (!window.XLSX) { toast("Модуль Excel ещё загружается, попробуйте через секунду", "error"); return; }
    batch = { stage: "loading", file: file.name }; renderBatch();
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var wb = XLSX.read(new Uint8Array(fr.result), { type: "array" });
        var aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
        var out = processRows(aoa);
        if (out.error) { batch = { stage: "error", errors: [out.error] }; }
        else { batch = { stage: "done", rows: out.rows, file: file.name }; track("batch_upload", { rows: out.rows.length }); }
      } catch (e) {
        batch = { stage: "error", errors: ["Не удалось обработать файл. Проверьте соответствие шаблону."] };
      }
      setTimeout(renderBatch, 300);
    };
    fr.onerror = function () { batch = { stage: "error", errors: ["Ошибка загрузки файла. Попробуйте снова."] }; renderBatch(); };
    fr.readAsArrayBuffer(file);
  }

  function processRows(aoa) {
    var hi = -1, cols = {};
    for (var i = 0; i < Math.min(aoa.length, 20); i++) {
      var r = aoa[i].map(function (c) { return String(c).toLowerCase(); });
      var a = r.findIndex(function (c) { return c.indexOf("артикул") !== -1 || c === "article" || c.indexOf("референс") !== -1; });
      if (a !== -1) {
        hi = i; cols.article = a;
        cols.qty = r.findIndex(function (c) { return c.indexOf("кол") === 0 || c.indexOf("количество") !== -1 || c === "qty"; });
        cols.man = r.findIndex(function (c) { return c.indexOf("производ") !== -1; });
        cols.power = r.findIndex(function (c) { return c.indexOf("мощн") !== -1; });
        cols.voltage = r.findIndex(function (c) { return c.indexOf("напряж") !== -1; });
        break;
      }
    }
    if (hi === -1) return { error: "Отсутствуют обязательные колонки: Артикул" };
    var rows = [];
    aoa.slice(hi + 1).forEach(function (r) {
      var art = String(r[cols.article] || "").trim();
      if (!art) return;
      var qty = cols.qty >= 0 ? Math.max(1, Math.round(TettaEngine.num(r[cols.qty]) || 1)) : 1;
      var own = engine.findProduct(art);
      if (own) { rows.push(rowOut({ article: art, name: "", manufacturer: "TETTAPRO" }, qty, [{ product: own, qty: 1 }], "Уже оборудование TETTAPRO")); return; }
      var ref = engine.findRef(art);
      var res, comment;
      if (ref) {
        res = engine.analogsFor(ref);
        comment = res.options.length > 1 ? "Альтернатива с запасом: " + res.options[1].items.map(function (x) { return x.product.article; }).join(" + ") : (res.options[0] && res.options[0].note) || "";
      } else {
        var pw = cols.power >= 0 ? TettaEngine.num(r[cols.power]) : null, v = cols.voltage >= 0 ? TettaEngine.num(r[cols.voltage]) : null;
        ref = { article: art, name: "", manufacturer: cols.man >= 0 ? String(r[cols.man] || "") : "" };
        if (pw && v) { res = engine.analogsByParams(pw, v); comment = res.options.length ? "Подобрано по параметрам " + pw + " Вт / " + v + " В — проверьте габариты и подключение" : ""; }
        else res = { options: [], reason: "Артикул не найден в базе. Укажите мощность и напряжение или обратитесь в поддержку" };
      }
      rows.push(rowOut(ref, qty, res.options[0] ? res.options[0].items : null, res.options.length ? comment : res.reason));
    });
    if (!rows.length) return { error: "В файле не найдено ни одной позиции. Проверьте соответствие структуры данных с файлом шаблона." };
    return { rows: rows };
  }
  function rowOut(ref, qty, items, comment) {
    var it = items && items[0];
    return {
      refArticle: ref.article, refName: ref.name, manufacturer: ref.manufacturer, qty: qty,
      article: it ? items.map(function (x) { return x.product.article; }).join(" + ") : "",
      name: it ? it.product.name : "", aqty: it ? qty * it.qty : 0, url: it ? it.product.url : "", comment: comment || ""
    };
  }

  /* ---------- Модальные окна ---------- */
  var modal = $("#modal");
  function openModal(html) {
    $("#modal-content").innerHTML = html;
    if (modal.showModal) modal.showModal(); else modal.setAttribute("open", "");
  }
  function closeModal() { if (modal.close) modal.close(); else modal.removeAttribute("open"); }
  $(".modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });

  var ABOUT = '<h2>О сервисе</h2>' +
    "<p>Перед Вами инструмент для подбора аналогов TETTAPRO к оборудованию других производителей по артикулу, серии или наименованию устройства.</p>" +
    "<p>Вам доступно два типа подбора: <b>одиночный</b> — для подбора аналогов для одного или нескольких аппаратов и <b>пакетный</b> — для загрузки списка оборудования с указанием количества каждой позиции и осуществления единовременного подбора большого количества позиций.</p>" +
    "<h3>Одиночный подбор</h3><ul>" +
    "<li>Для осуществления одиночного поиска введите в поле поиска артикул, серию или наименование оборудования и нажмите Enter. В появившихся ниже выпадающих списках выберите серию вашего продукта и его наименование, затем нажмите «Подобрать».</li>" +
    "<li>В случае, если запрошенному артикулу соответствует только один аналог, вы увидите его в правой части экрана под надписью «Рекомендованная замена».</li>" +
    "<li>В случае, если запрошенному артикулу соответствует несколько аналогов, вы увидите подзаголовок «Для данного референса доступно несколько аналогов» в блоке «Рекомендованная замена».</li></ul>" +
    "<p>После подтверждения аналога в режиме одиночного подбора, он попадает в блок «Подобранное», а для поиска следующего аналога вы можете повторить процедуру.</p>" +
    "<p>Вы можете удалить конкретный аппарат на любом этапе подбора, нажав на кнопку с корзиной в блоке «Подобранное». Также вы можете скачать список подобранных аналогов в формате Excel-таблицы, в которой будет указана вся информация об оборудовании.</p>" +
    "<h3>Пакетный подбор</h3>" +
    "<p>Для осуществления пакетного подбора перейдите в соответствующий режим, выбрав «Пакетный» в левой верхней части экрана. Скачайте шаблон, нажав на кнопку «Скачать шаблон», внесите в него артикул оборудования и количество имеющихся устройств для каждой позиции, сохраните заполненный шаблон, нажмите «Загрузить спецификацию» и выберите сохраненный файл.</p>" +
    "<p>После подбора аналогов по загруженной спецификации вы увидите процент успешно замененного оборудования, а также получите возможность скачать результат подбора, нажав на кнопку «Скачать спецификацию».</p>" +
    "<h3>Как подбирается аналог</h3>" +
    "<p>Аналог TETTAPRO подбирается по совпадению выходного напряжения и мощности: рекомендуется ближайшая модель с мощностью не ниже исходной. Перед заменой сверьте габариты, пусковые токи, условия эксплуатации и сигналы контроля (DC OK).</p>" +
    '<p>В случае возникновения любых дополнительных вопросов, вы можете обратиться в нашу <a data-mail="support">службу поддержки</a>, нажав на соответствующую кнопку в левом нижнем углу экрана.</p>' +
    '<p class="muted small">База обновлена: ' + esc((window.TETTA_DB || {}).updated || "") + " · референсов: " + engine.refs.length + "</p>";

  function feedbackHtml() {
    var scale = "";
    for (var i = 0; i <= 10; i++) scale += '<button type="button" class="nps" data-v="' + i + '">' + i + "</button>";
    return '<h2>Оцените сервис</h2><p>Насколько Вы удовлетворены опытом использования платформы сегодня?</p>' +
      '<div class="nps-row">' + scale + '</div><div class="nps-legend"><span>Не доволен</span><span>Очень доволен</span></div>' +
      '<label class="field"><span>Напишите ваш отзыв</span><textarea id="fb-text" rows="4" maxlength="2000" placeholder="Напишите, что необходимо доработать"></textarea></label>' +
      '<label class="field"><span>Ваше имя</span><input id="fb-name" maxlength="100"></label>' +
      '<label class="field"><span>Ваш e-mail или телефон (если потребуется уточнение)</span><input id="fb-contact" maxlength="100"></label>' +
      '<p class="muted small">Откроется ваша почтовая программа. Указанные данные будут использоваться только для связи с вами для обсуждения вашего отзыва.</p>' +
      '<div class="analog-actions"><button class="btn btn-primary" id="fb-send" type="button">Отправить</button><button class="btn btn-ghost" id="fb-skip" type="button">Пропустить</button></div>';
  }

  document.addEventListener("click", function (e) {
    var o = e.target.closest("[data-open]");
    if (o) {
      if (o.dataset.open === "about") openModal(ABOUT);
      if (o.dataset.open === "feedback") { openModal(feedbackHtml()); bindFeedback(); }
    }
    var m = e.target.closest("[data-mail]");
    if (m) {
      e.preventDefault();
      location.href = mailto(CFG.supportEmail, "Техническая поддержка по системе подбора аналогов", "Здравствуйте! Прошу помочь с подбором аналога TETTAPRO.\n\nАртикул и производитель:\nКоличество:\nТребования к оборудованию:\n");
    }
  });

  function bindFeedback() {
    var rating = null;
    $$(".nps").forEach(function (b) {
      b.addEventListener("click", function () {
        rating = +b.dataset.v;
        $$(".nps").forEach(function (x) { x.classList.toggle("is-active", x === b); });
      });
    });
    $("#fb-skip").addEventListener("click", closeModal);
    $("#fb-send").addEventListener("click", function () {
      var text = $("#fb-text").value.trim();
      if (rating == null && !text) { toast("Выберите оценку или напишите отзыв", "error"); return; }
      track("nps", { rating: rating });
      location.href = mailto(CFG.salesEmail, "Отзыв о системе подбора аналогов" + (rating != null ? " — оценка " + rating : ""),
        "Оценка: " + (rating != null ? rating + "/10" : "—") + "\n\n" + text + "\n\nИмя: " + $("#fb-name").value + "\nКонтакт: " + $("#fb-contact").value);
      closeModal();
      toast(rating != null && rating >= 9 ? "Спасибо за высокую оценку" : "Спасибо за обратную связь");
    });
  }

  /* ---------- Старт ---------- */
  setMode(state.mode);
  renderAnalog();
  renderPicked();
  if (innerWidth < 1100 && !state.picked.length) $("#picked").classList.add("is-collapsed");

  var pre = params.get("q") || params.get("prefillQuery");
  if (pre) {
    input.value = pre;
    var exact = engine.findRef(pre), own = engine.findProduct(pre);
    if (exact) { selectRef(exact); doMatch(); }
    else if (own) showOwn(own);
    else { renderDropdown(); input.focus(); }
  }
})();
