/* Система подбора аналогов TETTAPRO — интерфейс */
(function () {
  "use strict";
  var CFG = window.TETTA_CONFIG || {};
  var engine = new window.TettaEngine(window.TETTA_DB, CFG);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var params = new URLSearchParams(location.search);
  var STORE = "tettapro-analogs-picked-v2";
  var fmt = TettaEngine.fmt;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function deg(n) { return n == null ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n); }
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
    // Хук для Яндекс.Метрики / GTM на вашем сайте: window.dataLayer
    try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: "analogs_" + event }, data || {})); } catch (e) {}
  }
  function warnText(ev) {
    return ev ? ev.warns.map(function (w) { return w.label + ": " + w.text; }).join("; ") : "";
  }

  /* ---------- Режим встраивания ---------- */
  if (params.get("embed") === "1") document.documentElement.classList.add("embed");

  /* ---------- Состояние ---------- */
  var state = {
    mode: params.get("mode") === "batch" ? "batch" : "single",
    ref: null,            // референс, для которого выполнен подбор
    selLine: null,        // выбранная серия
    selRef: null,         // выбранный продукт в серии
    result: null,         // результат подбора
    optionIndex: 0,
    qty: 1,
    confirmed: false,
    picked: load()
  };
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { return []; } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state.picked)); } catch (e) {} }

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
  var input = $("#search"), dd = $("#search-dropdown"), activeIdx = -1, ddCount = 0;
  var GROUPS = { ref: "Референсы", line: "Серия", desc: "Наименование" };

  function renderDropdown() {
    var q = input.value.trim();
    $("#clear-btn").hidden = !input.value;
    ddCount = 0;
    activeIdx = -1;
    if (!q) { closeDD(); return; }
    var html = "";
    if (TettaEngine.norm(q).length < 2) {
      html = '<div class="dd-empty">Введите хотя бы два символа для поиска.</div>';
    } else {
      var own = engine.findProduct(q);
      var r = engine.search(q);
      if (own) {
        html += '<div class="dd-group">TettaPRO</div>';
        html += item("own", own.a, own.a, esc(own.a), esc(own.name));
      }
      ["ref", "line", "desc"].forEach(function (g) {
        if (!r[g].length) return;
        html += '<div class="dd-group">' + GROUPS[g] + "</div>";
        r[g].forEach(function (x) {
          if (g === "line") html += item("line", x.key, "", hl(x.series, q), esc(x.manufacturer) + " · " + x.items.length + " поз.");
          else html += item("ref", x.id, x.a, g === "ref" ? hl(x.a, q) : esc(x.a),
            "<b>" + esc(x.m) + "</b> · " + (g === "desc" ? hl(x.title, q) : esc(x.title)));
        });
      });
      if (!html) html = '<div class="dd-empty">К сожалению, мы не нашли позиции по вашему запросу.<br><a data-mail="support">Написать в поддержку</a></div>';
    }
    dd.innerHTML = html;
    dd.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  function item(type, value, article, title, sub) {
    var i = ddCount++;
    return '<button type="button" class="dd-item" role="option" data-type="' + type + '" data-value="' + esc(value) + '" data-article="' + esc(article) + '" id="dd-' + i + '">' +
      '<span class="dd-title">' + title + '</span><span class="dd-sub">' + sub + "</span></button>";
  }
  function hl(text, q) {
    text = String(text || "");
    var nq = q.trim();
    var i = text.toLowerCase().indexOf(nq.toLowerCase());
    if (!nq || i === -1) return esc(text);
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
      var exact = exactItems(all);
      var hit = exact.length === 1 ? exact[0] : (all.length === 1 ? all[0] : null);
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
      if (items[activeIdx]) items[activeIdx].click();
    } else if (e.key === "Escape") closeDD();
  });
  // Точные совпадения по артикулу (одинаковый артикул бывает у нескольких производителей)
  function exactItems(items) {
    var nq = TettaEngine.norm(input.value);
    return items.filter(function (x) { return x.dataset.type !== "line" && TettaEngine.norm(x.dataset.article) === nq; });
  }
  dd.addEventListener("click", function (e) {
    var b = e.target.closest(".dd-item");
    if (!b) return;
    closeDD();
    if (b.dataset.type === "line") selectLine(b.dataset.value);
    else if (b.dataset.type === "own") showOwn(engine.findProduct(b.dataset.value));
    else selectRef(engine.getRef(+b.dataset.value));
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
    track("select_ref", { reference: ref.a, manufacturer: ref.m });
    input.value = ref.a;
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

  function info(label, v) { return v == null || v === "" ? "" : "<div><dt>" + label + ":</dt><dd>" + esc(v) + "</dd></div>"; }
  function sizeTxt(o) { return o.w != null ? fmt(o.w) + " × " + fmt(o.h) + " × " + fmt(o.d) + " мм" : ""; }
  function tempTxt(o) { return o.tmin != null || o.tmax != null ? deg(o.tmin) + "…" + deg(o.tmax) + " °C" : ""; }
  function inputTxt(o) { return [o.ac ? o.ac + " В AC" : "", o.dc ? o.dc + " В DC" : ""].filter(Boolean).join(" / ") + (o.ph ? ", " + o.ph : ""); }

  function renderRefPanel() {
    var panel = $("#ref-panel"), line = state.selLine, r = state.selRef;
    var lineOpts = engine.lines.map(function (l) {
      return '<option value="' + esc(l.key) + '"' + (line && l.key === line.key ? " selected" : "") + ">" + esc(l.series) + " — " + esc(l.manufacturer) + "</option>";
    }).join("");
    var prodOpts = line ? line.items.map(function (x) {
      return '<option value="' + x.id + '"' + (r && x.id === r.id ? " selected" : "") + ">" + esc(x.a) + " — " + esc(x.title) + "</option>";
    }).join("") : "";
    panel.innerHTML =
      '<label class="field"><span>Серия</span><select id="sel-line"><option value="" disabled' + (line ? "" : " selected") + ">Выберите серию</option>" + lineOpts + "</select></label>" +
      '<label class="field"><span>Релевантный продукт</span><select id="sel-ref"' + (line ? "" : " disabled") + '><option value="" disabled' + (r ? "" : " selected") + ">" + (line && line.items.length ? "Выберите продукт" : "Продукты отсутствуют") + "</option>" + prodOpts + "</select></label>" +
      (r ? '<dl class="ref-info">' +
        info("Артикул", r.a) + info("Наименование", r.name) + info("Серия", r.s) + info("Производитель", r.m) +
        info("Выход", fmt(r.power) + " Вт · " + fmt(r.voltage) + " В DC · " + fmt(r.current) + " А") +
        info("Вход", inputTxt(r)) + info("Габариты (Ш×В×Г)", sizeTxt(r)) + info("Температура", tempTxt(r)) +
        "</dl>" : (line ? '<p class="muted small">Выберите продукт из серии, чтобы подобрать аналог.</p>' : "")) +
      '<div class="ref-actions">' +
      '<label class="field qty-field"><span>Количество</span>' + stepper("ref-qty", state.qty) + "</label>" +
      '<button class="btn btn-primary" id="do-match" type="button"' + (r ? "" : " disabled") + ">Подобрать</button>" +
      '<button class="btn btn-ghost" id="new-search" type="button">Новый поиск</button></div>';
    panel.hidden = false;

    $("#sel-line").addEventListener("change", function (e) { selectLine(e.target.value); });
    $("#sel-ref").addEventListener("change", function (e) { selectRef(engine.getRef(+e.target.value)); });
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
    track("search_click", { reference: state.ref.a, found: state.result.options.length });
    renderAnalog();
    if (window.innerWidth < 1100) $("#analog-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  var ICON = { ok: "✓", warn: "!", info: "i", unknown: "?" };
  function checksTable(ev, ref) {
    return '<table class="cmp"><thead><tr><th>Параметр</th><th>' + esc(ref.a) + "</th><th>" + esc(ev.product.a) + "</th></tr></thead><tbody>" +
      ev.checks.map(function (c) {
        return '<tr class="st-' + c.status + '"><td>' + esc(c.label) + "</td><td>" + esc(c.ref) + '</td><td><span class="st-ico" aria-hidden="true">' + ICON[c.status] + "</span>" + esc(c.tetta) +
          (c.text ? '<div class="st-text">' + esc(c.text) + "</div>" : "") + "</td></tr>";
      }).join("") + "</tbody></table>";
  }

  function productCard(p, qty, ev, ref) {
    var img = p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.a) + '" loading="lazy">' : '<img src="assets/img/theta.svg" alt="" class="no-photo">';
    return '<div class="product">' +
      '<div class="product-img' + (p.image ? "" : " is-empty") + '">' + img + "</div>" +
      '<div class="product-body">' +
      '<div class="product-series">' + esc(p.s) + " SERIES</div>" +
      '<div class="product-article">' + esc(p.a) + (qty > 1 ? ' <span class="x">× ' + qty + "</span>" : "") + "</div>" +
      '<div class="product-name">' + esc(p.name) + "</div>" +
      (ev ? '<span class="badge badge-' + ev.level + '">' + esc(ev.levelText) + "</span>" : "") +
      '<div class="specs">' +
      spec("Выход", fmt(p.voltage) + " В DC / " + fmt(p.current) + " А") + spec("Мощность", fmt(p.power) + " Вт") +
      spec("Вход", inputTxt(p)) + spec("КПД", p.efficiency) + spec("Габариты (Ш×В×Г)", sizeTxt(p) || "уточняются") +
      spec("Рабочая температура", tempTxt(p)) + spec("DC OK", p.dcok) + spec("Гарантия", p.warranty) + "</div>" +
      "</div></div>" +
      (ev && ref ? '<div class="cmp-wrap"><div class="cmp-title">Сравнение с ' + esc(ref.a) + " (" + esc(ref.m) + ")</div>" + checksTable(ev, ref) + "</div>" : "");
  }
  function spec(k, v) { return v ? '<div class="spec"><span>' + k + "</span><b>" + esc(v) + "</b></div>" : ""; }

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
      panel.innerHTML = head + '<p class="note">Это оборудование TettaPRO — замена не требуется.</p>' + productCard(p, 1) +
        '<div class="analog-actions"><a class="btn btn-primary" href="' + esc(p.url) + '" target="_blank" rel="noopener">Подробнее о модели</a>' +
        '<a class="btn btn-ghost" href="' + esc(buyLink([{ product: p, qty: 1 }], 1)) + '">Купить</a></div>';
      return;
    }
    if (!res.options.length) {
      panel.innerHTML = head + '<div class="ref-line">Замена для <b>' + esc(ref.a) + "</b> · " + esc(ref.m) + "</div>" +
        '<div class="not-found"><b>К сожалению, мы не нашли доступный аналог для данной позиции.</b>' +
        (res.reason ? "<p>" + esc(res.reason) + ".</p>" : "") +
        '<p>Пожалуйста, обратитесь за консультацией по адресу <a href="' + esc(mailto(CFG.supportEmail, "Подбор аналога: " + ref.a, "Здравствуйте! Прошу подобрать аналог TettaPRO для: " + ref.a + " (" + ref.m + "), " + ref.name + ".\nКоличество: " + state.qty + " шт.")) + '">' + esc(CFG.supportEmail) + "</a></p></div>" +
        '<div class="analog-actions"><button class="btn btn-ghost" id="again" type="button">Новый подбор</button></div>';
      $("#again").addEventListener("click", function () { resetSingle(); input.focus(); });
      return;
    }

    var multi = res.options.length > 1;
    var html = head + '<div class="ref-line">Замена для <b>' + esc(ref.a) + "</b> · " + esc(ref.m) + " · " + state.qty + " шт</div>";
    if (multi && !state.confirmed) {
      html += '<p class="note">Для данного референса доступно несколько аналогов.<br>Пожалуйста, выберите подходящий вам вариант.</p><div class="tabs" role="tablist">';
      res.options.forEach(function (o, i) {
        html += '<button type="button" role="tab" class="tab' + (i === state.optionIndex ? " is-active" : "") + '" data-opt="' + i + '">' +
          '<span class="tab-head">Выбрать аналог ' + (i + 1) + '<i class="dot dot-' + o.eval.level + '" title="' + esc(o.eval.levelText) + '"></i></span>' +
          "<small><b>" + esc(o.items[0].product.a) + "</b> · " + esc(o.note) + "</small></button>";
      });
      html += "</div>";
    }
    var opt = res.options[state.optionIndex];
    if (!multi) html += '<p class="note small">' + esc(opt.note) + "</p>";
    html += productCard(opt.items[0].product, opt.items[0].qty, opt.eval, ref);

    var buy = buyLink(opt.items, state.qty);
    html += '<div class="analog-actions">';
    if (state.confirmed) {
      html += '<span class="done">✓ Добавлено в «Подобранное»</span><button class="btn btn-primary" id="again" type="button">Новый подбор</button>';
    } else {
      html += '<button class="btn btn-primary" id="confirm" type="button">' + (multi ? "Подтвердить выбор" : "Добавить в подобранное") + "</button>";
    }
    html += '<a class="btn btn-ghost" href="' + esc(buy) + '">Купить</a>' +
      '<a class="btn btn-link" href="' + esc(opt.items[0].product.url) + '" target="_blank" rel="noopener">Характеристики ↗</a></div>';
    panel.innerHTML = html;

    $$(".tab", panel).forEach(function (t) { t.addEventListener("click", function () { state.optionIndex = +t.dataset.opt; renderAnalog(); }); });
    var c = $("#confirm"); if (c) c.addEventListener("click", confirmPick);
    var a = $("#again"); if (a) a.addEventListener("click", function () { resetSingle(); input.focus(); });
  }

  function buyLink(items, qty) {
    var lines = items.map(function (x) { return "• " + x.product.a + " — " + (x.qty * qty) + " шт."; }).join("\n");
    return mailto(CFG.salesEmail, "TettaPRO — запрос цены", "Здравствуйте! Прошу выставить предложение:\n" + lines + "\n\nКомпания:\nКонтактное лицо:\nТелефон:");
  }

  function confirmPick() {
    var opt = state.result.options[state.optionIndex], ref = state.ref, art = opt.items[0].product.a;
    var existing = state.picked.filter(function (p) { return p.refId === ref.m + "|" + ref.a && p.analog === art; })[0];
    if (existing) existing.qty += state.qty;
    else state.picked.push({
      refId: ref.m + "|" + ref.a, ref: ref.a, refName: ref.name, manufacturer: ref.m,
      analog: art, analogQty: opt.items[0].qty, level: opt.eval.levelText, warn: warnText(opt.eval), qty: state.qty
    });
    save();
    state.confirmed = true;
    track("analog_confirm", { reference: ref.a, analog: art, level: opt.eval.level });
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
      return '<div class="pick" data-i="' + i + '">' +
        '<div class="pick-top"><div><div class="pick-analog">' + esc(p.analog) + (p.warn ? ' <i class="dot dot-partial" title="' + esc(p.level) + '"></i>' : ' <i class="dot dot-full" title="' + esc(p.level) + '"></i>') + '</div><div class="pick-ref">вместо ' + esc(p.ref) + " · " + esc(p.manufacturer) + "</div></div>" +
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
    var rows = state.picked.map(function (p) {
      var pr = engine.findProduct(p.analog) || {};
      return { refArticle: p.ref, refName: p.refName, manufacturer: p.manufacturer, qty: p.qty,
        article: p.analog, name: pr.name, aqty: p.qty * (p.analogQty || 1), url: pr.url, level: p.level, comment: p.warn };
    });
    exportSpec(rows, "Спецификация_TettaPRO_" + today() + ".xlsx");
    track("download_spec", { mode: "single", rows: rows.length });
  });
  $("#buy-all").addEventListener("click", function () {
    var agg = {};
    state.picked.forEach(function (p) { agg[p.analog] = (agg[p.analog] || 0) + p.qty * (p.analogQty || 1); });
    location.href = buyAllLink(agg);
  });
  function buyAllLink(agg) {
    var lines = Object.keys(agg).map(function (a) { return "• " + a + " — " + agg[a] + " шт."; }).join("\n");
    return mailto(CFG.salesEmail, "TettaPRO — запрос цены по спецификации", "Здравствуйте! Прошу выставить предложение:\n" + lines + "\n\nСпецификацию Excel прикладываю.\n\nКомпания:\nКонтактное лицо:\nТелефон:");
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  /* ---------- Экспорт в Excel ---------- */
  function exportSpec(rows, filename, summary) {
    if (!window.XLSX) { toast("Модуль Excel ещё загружается, попробуйте через секунду", "error"); return; }
    var head = ["№", "Референс: артикул", "Референс: наименование", "Производитель", "Кол-во, шт", "Аналог TettaPRO: артикул", "Аналог: наименование", "Кол-во аналога, шт", "Соответствие", "Оговорки / комментарий", "Ссылка"];
    var aoa = [["Спецификация подбора аналогов TettaPRO от " + new Date().toLocaleDateString("ru-RU")]];
    if (summary) aoa.push([summary]);
    aoa.push([]);
    aoa.push(head);
    rows.forEach(function (r, i) {
      aoa.push([i + 1, r.refArticle, r.refName || "", r.manufacturer || "", r.qty, r.article || "—", r.name || "", r.article ? r.aqty : "", r.level || (r.article ? "" : "Аналог не найден"), r.comment || "", r.url || ""]);
    });
    var agg = {};
    rows.forEach(function (r) { if (r.article) agg[r.article] = (agg[r.article] || 0) + (r.aqty || 0); });
    aoa.push([]);
    aoa.push(["", "Итого к заказу TettaPRO"]);
    Object.keys(agg).forEach(function (a) { var p = engine.findProduct(a) || {}; aoa.push(["", a, p.name || "", "", agg[a]]); });
    aoa.push([]);
    aoa.push(["", "Перед заменой сверьте оговорки. Запрос цены: " + CFG.salesEmail + " · " + CFG.catalogUrl]);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 5 }, { wch: 22 }, { wch: 50 }, { wch: 18 }, { wch: 10 }, { wch: 20 }, { wch: 46 }, { wch: 12 }, { wch: 20 }, { wch: 70 }, { wch: 40 }];
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
        '<li><span class="step-n">2</span><div><b>Внесите ваше оборудование в шаблон</b><p class="muted small">Артикул и количество для каждой позиции. Производитель нужен, если один артикул выпускают разные компании. Если артикула нет в базе, укажите мощность и напряжение — подберём по параметрам.</p></div></li>' +
        '<li><span class="step-n">3</span><div><b>Загрузите полученную спецификацию со своего устройства</b>' +
        '<label class="drop" id="drop"><input type="file" id="file" accept=".xlsx,.xls,.csv" hidden>' +
        '<span class="drop-icon">⇪</span><span><b>Загрузить спецификацию</b><br><span class="muted small">Выберите файл на устройстве или перетащите его сюда · .xlsx, .xls</span></span></label></div></li></ol>';
      if (batch.stage === "error") {
        html += '<div class="not-found"><b>Не удалось распознать файл</b><p>' + esc(batch.errors[0] || "Проверьте соответствие структуры данных с файлом шаблона и формат файла") + "</p></div>";
      }
    } else if (batch.stage === "loading") {
      html += '<div class="loading"><span class="spinner"></span>Анализируем файл</div>';
    } else if (batch.stage === "done") {
      var rows = batch.rows;
      var ok = rows.filter(function (r) { return r.article; }).length;
      var full = rows.filter(function (r) { return r.level === "Полная замена" || r.level === "Оборудование TettaPRO"; }).length;
      var pct = rows.length ? Math.round(ok / rows.length * 100) : 0;
      html += '<div class="batch-result"><div class="pct"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" class="pct-bg"/><circle cx="18" cy="18" r="15.9" class="pct-fg" stroke-dasharray="' + pct + ' 100"/></svg><b>' + pct + "%</b></div>" +
        "<div><b>Успешно подобрано " + pct + "% оборудования</b><p class=\"muted small\">" + esc(batch.file) + " · позиций: " + rows.length +
        " · полная замена: " + full + " · с оговорками или по параметрам: " + (ok - full) + " · без аналога: " + (rows.length - ok) + "</p>" +
        (ok < rows.length || full < ok ? '<p class="small">Если у вас остались вопросы по подбору аналогов, обратитесь в <a data-mail="support">службу технической поддержки</a>.</p>' : "") + "</div></div>" +
        '<div class="analog-actions"><button class="btn btn-primary" id="dl-batch" type="button">Скачать спецификацию</button>' +
        '<button class="btn btn-ghost" id="buy-batch" type="button">Купить все</button>' +
        '<button class="btn btn-link" id="batch-new" type="button">Новый подбор</button></div>' +
        '<div class="table-wrap"><table class="result-table"><thead><tr><th>№</th><th>Референс</th><th>Производитель</th><th>Кол-во</th><th>Аналог TettaPRO</th><th>Кол-во</th><th>Соответствие</th></tr></thead><tbody>' +
        rows.map(function (r, i) {
          var lvl = !r.article ? '<span class="badge badge-none">Нет аналога</span>' : '<span class="badge badge-' + (r.level === "Полная замена" || r.level === "Оборудование TettaPRO" ? "full" : "partial") + '">' + esc(r.level) + "</span>";
          return '<tr class="' + (r.article ? "" : "miss") + '"><td>' + (i + 1) + "</td><td><b>" + esc(r.refArticle) + '</b><div class="muted small">' + esc(r.refTitle || "") + "</div></td><td>" + esc(r.manufacturer || "—") +
            "</td><td>" + r.qty + "</td><td>" + (r.article ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener"><b>' + esc(r.article) + "</b></a>" : "—") + "</td><td>" + (r.article ? r.aqty : "") + "</td><td>" + lvl +
            (r.comment ? '<div class="small muted">' + esc(r.comment) + "</div>" : "") + "</td></tr>";
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
      exportSpec(batch.rows, "Пакетный_подбор_TettaPRO_" + today() + ".xlsx", "Исходный файл: " + batch.file + " · подобрано " + ok + " из " + batch.rows.length);
      track("download_spec", { mode: "batch", rows: batch.rows.length });
    });
    var bb = $("#buy-batch"); if (bb) bb.addEventListener("click", function () {
      var agg = {};
      batch.rows.forEach(function (r) { if (r.article) agg[r.article] = (agg[r.article] || 0) + r.aqty; });
      location.href = buyAllLink(agg);
    });
    var bn = $("#batch-new"); if (bn) bn.addEventListener("click", function () { batch = { stage: "start", rows: null, file: "", errors: [] }; renderBatch(); });
  }

  function downloadTemplate() {
    if (!window.XLSX) { toast("Модуль Excel ещё загружается, попробуйте через секунду", "error"); return; }
    var aoa = [
      ["Артикул", "Количество", "Производитель", "Мощность, Вт", "Выходное напряжение, В"],
      ["NDR-240-24", 5, "Mean Well", "", ""],
      ["MDR-60-24", 2, "Mean Well", "", ""],
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
        if (out.error) batch = { stage: "error", errors: [out.error] };
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
      var man = cols.man >= 0 ? String(r[cols.man] || "").trim() : "";
      var own = engine.findProduct(art);
      if (own) {
        rows.push({ refArticle: art, refTitle: own.name, manufacturer: "TettaPRO", qty: qty, article: own.a, name: own.name, aqty: qty, url: own.url, level: "Оборудование TettaPRO", comment: "" });
        return;
      }
      var found = engine.findRefs(art, man);
      var ref = found[0] || null, res, note = "";
      if (found.length > 1) note = "Артикул есть у нескольких производителей (" + found.map(function (x) { return x.m; }).join(", ") + ") — взят " + ref.m + ", укажите производителя в файле";
      if (ref) res = engine.analogsFor(ref);
      else {
        var pw = cols.power >= 0 ? TettaEngine.num(r[cols.power]) : null, v = cols.voltage >= 0 ? TettaEngine.num(r[cols.voltage]) : null;
        ref = { a: art, m: man, name: "", title: "" };
        if (pw && v) { res = engine.analogsByParams(pw, v); note = "Подобрано по параметрам " + pw + " Вт / " + v + " В — артикула нет в базе"; }
        else res = { options: [], reason: "Артикул не найден в базе. Укажите мощность и напряжение или обратитесь в поддержку" };
      }
      var opt = res.options[0];
      var byParams = !found.length && opt;
      rows.push({
        refArticle: art, refName: ref.name, refTitle: ref.title, manufacturer: ref.m || man, qty: qty,
        article: opt ? opt.items[0].product.a : "", name: opt ? opt.items[0].product.name : "",
        aqty: opt ? qty * opt.items[0].qty : 0, url: opt ? opt.items[0].product.url : "",
        level: byParams ? "Подбор по параметрам" : opt ? opt.eval.levelText : "",
        comment: opt ? [note, warnText(opt.eval), res.options[1] ? "Альтернатива: " + res.options.slice(1).map(function (o) { return o.items[0].product.a + " (" + o.note.toLowerCase() + ")"; }).join(", ") : ""].filter(Boolean).join(". ")
          : [note, res.reason].filter(Boolean).join(". ")
      });
    });
    if (!rows.length) return { error: "В файле не найдено ни одной позиции. Проверьте соответствие структуры данных с файлом шаблона." };
    return { rows: rows };
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

  var mans = {};
  engine.refs.forEach(function (r) { mans[r.m] = 1; });
  var ABOUT = '<h2>О сервисе</h2>' +
    "<p>Перед Вами инструмент для подбора аналогов TettaPRO к блокам питания других производителей по артикулу, серии или наименованию устройства.</p>" +
    "<p>Вам доступно два типа подбора: <b>одиночный</b> — для подбора аналогов для одного или нескольких аппаратов и <b>пакетный</b> — для загрузки списка оборудования с указанием количества каждой позиции и осуществления единовременного подбора большого количества позиций.</p>" +
    "<h3>Одиночный подбор</h3><ul>" +
    "<li>Введите в поле поиска артикул, серию или наименование оборудования и нажмите Enter. В выпадающих списках выберите серию вашего продукта и его наименование, затем нажмите «Подобрать».</li>" +
    "<li>Если запрошенному артикулу соответствует один аналог, вы увидите его в правой части экрана под надписью «Рекомендованная замена».</li>" +
    "<li>Если подходит несколько аналогов, вы увидите подзаголовок «Для данного референса доступно несколько аналогов» и сможете выбрать вариант.</li></ul>" +
    "<p>После подтверждения аналог попадает в блок «Подобранное». Его можно удалить кнопкой с корзиной, а весь список — скачать в формате Excel.</p>" +
    "<h3>Пакетный подбор</h3>" +
    "<p>Выберите «Пакетный» в левой верхней части экрана, скачайте шаблон, внесите артикулы и количество, загрузите файл. Вы увидите процент успешно замененного оборудования и сможете скачать результат.</p>" +
    "<h3>Как подбирается аналог</h3><ul>" +
    "<li><b>Обязательно:</b> то же выходное напряжение, мощность и номинальный ток TettaPRO не ниже, чем у заменяемого блока.</li>" +
    "<li><b>Проверяется:</b> вход и фазность сети, рабочая температура, ширина на DIN-рейке, высота и глубина, пиковый ток (boost), параллельная работа, ККМ.</li>" +
    "<li><b>Полная замена</b> — все проверенные параметры не хуже. <b>Замена с оговорками</b> — есть отличия, их список показан в таблице сравнения и в спецификации.</li>" +
    "<li>Рекомендуется ближайшая по мощности модель. Дополнительно предлагается вариант без оговорок и вариант с запасом по мощности, если исходный блок нагружает модель больше чем на " + Math.round((CFG.marginThreshold || 0.8) * 100) + "%.</li></ul>" +
    '<p>В случае возникновения любых дополнительных вопросов, вы можете обратиться в нашу <a data-mail="support">службу поддержки</a>.</p>' +
    '<p class="muted small">База обновлена: ' + esc((window.TETTA_DB || {}).updated || "") + " · моделей TettaPRO: " + engine.products.length + " · блоков других производителей: " + engine.refs.length + " · производителей: " + Object.keys(mans).length + "</p>";

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
      location.href = mailto(CFG.supportEmail, "Техническая поддержка по системе подбора аналогов", "Здравствуйте! Прошу помочь с подбором аналога TettaPRO.\n\nАртикул и производитель:\nКоличество:\nТребования к оборудованию:\n");
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
    var hits = engine.findRefs(pre, params.get("m") || params.get("manufacturer"));
    var own = engine.findProduct(pre);
    if (hits.length === 1) { selectRef(hits[0]); doMatch(); }
    else if (own) showOwn(own);
    else { renderDropdown(); input.focus(); }
  }
})();
