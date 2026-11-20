/*
 * Логика подбора замены блоков питания на TettaPRO. Без зависимостей.
 *
 * 1. Обязательные условия (иначе модель не предлагается):
 *    — то же выходное напряжение;
 *    — мощность и номинальный ток TettaPRO не ниже, чем у референса.
 * 2. Проверки совместимости (дают оговорки, но не запрещают замену):
 *    вход и фазность, температура, ширина на DIN-рейке, высота и глубина,
 *    пиковый ток (boost), параллельная работа, ККМ.
 * 3. Рекомендуется самая близкая по мощности модель с наименьшими оговорками.
 *    Дополнительно (до 3 вариантов): модель без оговорок, если рекомендованная
 *    их имеет, и вариант с запасом по мощности, если референс нагружает
 *    рекомендованную модель больше чем на marginThreshold.
 */
(function (root) {
  "use strict";

  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/ё/g, "е").replace(/[\s\-_./\\(),]+/g, "");
  }
  function words(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/ё/g, "е").split(/[\s,;]+/).filter(Boolean);
  }
  function num(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    var m = String(v).replace(/\s/g, "").replace(",", ".").replace(/[−–—]/g, "-").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  /*
   * Диапазон входного напряжения из текста таблицы:
   *   "85…264" -> [85, 264]; "220 (ном.)" -> [220, 220]; "115/230" -> [115, 230]
   *   "100…240 (ном., -15 %/+10 %)" -> [85, 264]; "100…240 (ном., ± 10 %)" -> [90, 264]
   *   "3x320…3x575", "3×320…550 / 2×360…550" -> множитель фаз отбрасывается
   */
  function range(s) {
    if (s == null || s === "") return null;
    s = String(s).replace(/,(?=\d)/g, ".");
    var main = s.split("(")[0].replace(/\d\s*[x×х]\s*(?=\d)/gi, "");
    var m = main.match(/\d+(\.\d+)?/g);
    if (!m) return null;
    var a = m.map(parseFloat);
    var lo = Math.min.apply(null, a), hi = Math.max.apply(null, a);
    var paren = (s.match(/\(([^)]*)\)/) || [])[1] || "";
    var t = paren.match(/-\s*(\d+(?:\.\d+)?)\s*%\s*\/\s*\+\s*(\d+(?:\.\d+)?)\s*%/);
    var pm = paren.match(/±\s*(\d+(?:\.\d+)?)\s*%/);
    if (t) { lo *= 1 - t[1] / 100; hi *= 1 + t[2] / 100; }
    else if (pm) { lo *= 1 - pm[1] / 100; hi *= 1 + pm[1] / 100; }
    return [Math.round(lo), Math.round(hi)];
  }
  /* Фазность: какие варианты поддерживаются */
  function phases(s) {
    s = String(s || "").toLowerCase();
    if (!s) return null;
    var out = [];
    (s.match(/\d/g) || []).forEach(function (d) { out.push(+d); });
    return out.length ? out : null;
  }
  function f(n) { return n == null ? "—" : String(Math.round(n * 100) / 100).replace(".", ","); }
  function deg(n) { return n == null ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n) + " °C"; }

  function prep(o, i) {
    var r = Object.assign({}, o);
    r.id = i;
    r.article = r.a; r.manufacturer = r.m; r.series = r.s || ""; r.power = num(r.p); r.voltage = num(r.v);
    r.current = num(r.i) != null ? num(r.i) : (r.power && r.voltage ? r.power / r.voltage : null);
    r.title = "Блок питания " + f(r.power) + " Вт, " + f(r.voltage) + " В, " + f(r.current) + " А";
    r.name = r.desc || r.title;
    r.acR = range(r.ac); r.dcR = range(r.dc); r.phs = phases(r.ph);
    r._a = norm(r.a);
    r._hay = (r.a + " " + r.s + " " + r.m + " " + (r.desc || "")).toLowerCase().replace(/ё/g, "е");
    return r;
  }

  function Engine(db, cfg) {
    cfg = cfg || {};
    this.margin = cfg.marginThreshold || 0.8;
    this.extras = cfg.productExtras || {};
    var self = this;
    this.products = (db.products || []).map(function (p, i) {
      var r = prep(p, "p" + i);
      r.name = "Источник питания " + f(r.voltage) + " В DC, " + f(r.power) + " Вт, " + f(r.current) + " А, на DIN-рейку";
      r.warranty = cfg.warranty || "";
      Object.assign(r, self.extras[r.a] || {});
      r.url = r.url || cfg.catalogUrl || "";
      return r;
    });
    this.byProduct = {};
    this.products.forEach(function (p) { self.byProduct[norm(p.a)] = p; });

    this.refs = (db.references || []).map(prep);
    this.byId = {};
    this.byArticle = {};
    this.refs.forEach(function (r) {
      self.byId[r.id] = r;
      (self.byArticle[r._a] = self.byArticle[r._a] || []).push(r);
    });

    var lines = {};
    this.refs.forEach(function (r) {
      var key = r.m + " · " + (r.s || "без серии");
      if (!lines[key]) lines[key] = { key: key, series: r.s || "без серии", manufacturer: r.m, items: [] };
      lines[key].items.push(r);
    });
    this.lines = Object.keys(lines).sort(function (a, b) { return a.localeCompare(b, "ru"); }).map(function (k) { return lines[k]; });
  }

  /* Поиск: группы ref (по артикулу) / line (серии) / desc (по словам в описании) */
  Engine.prototype.search = function (q, limit) {
    limit = limit || 10;
    var nq = norm(q), ws = words(q);
    var res = { ref: [], line: [], desc: [] };
    if (nq.length < 2) return res;
    var allWords = function (hay) { return ws.every(function (w) { return hay.indexOf(w) !== -1 || norm(hay).indexOf(norm(w)) !== -1; }); };

    var refHits = this.refs.filter(function (r) { return r._a.indexOf(nq) !== -1; });
    refHits.sort(function (a, b) {
      var sa = a._a.indexOf(nq) === 0 ? 0 : 1, sb = b._a.indexOf(nq) === 0 ? 0 : 1;
      return sa - sb || a._a.length - b._a.length || a._a.localeCompare(b._a);
    });
    res.ref = refHits.slice(0, limit);

    res.line = this.lines.filter(function (l) {
      return norm(l.series).indexOf(nq) !== -1 || allWords((l.manufacturer + " " + l.series).toLowerCase());
    }).slice(0, limit);

    var refIds = {};
    res.ref.forEach(function (r) { refIds[r.id] = 1; });
    res.desc = this.refs.filter(function (r) { return !refIds[r.id] && allWords(r._hay); }).slice(0, limit);
    return res;
  };

  Engine.prototype.lineOf = function (ref) {
    var key = ref.m + " · " + (ref.s || "без серии");
    return this.lines.filter(function (l) { return l.key === key; })[0] || null;
  };
  Engine.prototype.getRef = function (id) { return this.byId[id] || null; };
  /* Поиск по артикулу; при совпадении у нескольких производителей уточняет по manufacturer */
  Engine.prototype.findRefs = function (article, manufacturer) {
    var list = this.byArticle[norm(article)] || [];
    if (manufacturer && list.length > 1) {
      var nm = norm(manufacturer);
      var hit = list.filter(function (r) { var m = norm(r.m); return m.indexOf(nm) !== -1 || nm.indexOf(m) !== -1; });
      if (hit.length) return hit;
    }
    return list;
  };
  Engine.prototype.findProduct = function (article) { return this.byProduct[norm(article)] || null; };

  /*
   * Проверки совместимости модели TettaPRO p с референсом r.
   * status: ok | warn | info | unknown. weight — вклад в оценку оговорок.
   */
  Engine.prototype.checks = function (r, p) {
    var c = [];
    function add(label, rv, pv, status, text, weight) {
      c.push({ label: label, ref: rv, tetta: pv, status: status, text: text || "", weight: weight || 0 });
    }

    add("Выходное напряжение", f(r.voltage) + " В DC", f(p.voltage) + " В DC", "ok");
    var load = r.power / p.power;
    add("Мощность", f(r.power) + " Вт", f(p.power) + " Вт", "ok",
      p.power > r.power ? "запас " + Math.round((1 - load) * 100) + "%" : "совпадает");
    add("Номинальный ток", f(r.current) + " А", f(p.current) + " А", "ok");

    // Пиковый ток / boost
    var rPeak = Math.max(r.ipk || 0, r.imax || 0);
    if (rPeak > (r.current || 0) * 1.01) {
      if (p.current >= rPeak) add("Пиковый ток (boost)", f(rPeak) + " А", f(p.current) + " А ном.", "ok", "покрывается номинальным током");
      else add("Пиковый ток (boost)", f(rPeak) + " А", "не заявлен", "warn", "у референса есть резерв по току — проверьте пусковые токи нагрузки", 2);
    }

    // Вход: фазность
    var rph = r.phs, pph = p.phs || [1];
    if (rph && rph.indexOf(1) === -1) {
      add("Фазность входа", r.ph, p.ph || "1 фаза", "warn", "референс подключается к " + (rph.indexOf(3) !== -1 ? "трём фазам" : "двум фазам") + " — для TettaPRO нужна одна фаза и нейтраль (220 В)", 3);
    } else if (rph) {
      add("Фазность входа", r.ph, p.ph || "1 фаза", "ok");
    }
    // Вход: диапазон AC (только для однофазных)
    if (r.acR && p.acR && (!rph || rph.indexOf(1) !== -1)) {
      var lowOk = p.acR[0] <= r.acR[0] + 5, highOk = p.acR[1] >= r.acR[1] - 5;
      var rTxt = r.acR[0] + "…" + r.acR[1] + " В AC", pTxt = p.acR[0] + "…" + p.acR[1] + " В AC";
      if (lowOk && highOk) add("Вход AC", rTxt, pTxt, "ok");
      else {
        var t = [];
        if (!lowOk) t.push(p.acR[0] >= 150 ? "не работает от сети 110–127 В" : "нижняя граница выше на " + Math.round(p.acR[0] - r.acR[0]) + " В");
        if (!highOk) t.push("верхняя граница ниже на " + Math.round(r.acR[1] - p.acR[1]) + " В");
        add("Вход AC", rTxt, pTxt, "warn", t.join("; ") + " — для сети 220 В подходит", p.acR[0] <= 200 && p.acR[1] >= 240 ? 1 : 3);
      }
    } else if (!r.acR && (!rph || rph.indexOf(1) !== -1)) {
      add("Вход AC", "нет данных", p.acR ? p.acR[0] + "…" + p.acR[1] + " В AC" : "—", "unknown");
    }

    // Температура
    if (r.tmin != null || r.tmax != null) {
      var bad = [];
      if (r.tmin != null && p.tmin != null && p.tmin > r.tmin) bad.push("нижняя граница " + deg(p.tmin) + " вместо " + deg(r.tmin));
      if (r.tmax != null && p.tmax != null && p.tmax < r.tmax) bad.push("верхняя граница " + deg(p.tmax) + " вместо " + deg(r.tmax));
      var rT = deg(r.tmin) + "…" + deg(r.tmax), pT = deg(p.tmin) + "…" + deg(p.tmax);
      if (bad.length) add("Рабочая температура", rT, pT, "warn", bad.join("; ") + " — проверьте условия в шкафу", 2);
      else add("Рабочая температура", rT, pT, "ok");
    } else {
      add("Рабочая температура", "нет данных", deg(p.tmin) + "…" + deg(p.tmax), "unknown");
    }

    // Габариты
    if (r.w != null && p.w != null) {
      var dw = Math.round((p.w - r.w) * 10) / 10;
      if (dw <= 1) add("Ширина на DIN-рейке", f(r.w) + " мм", f(p.w) + " мм", "ok", dw < -0.5 ? "уже на " + f(-dw) + " мм" : "совпадает");
      else add("Ширина на DIN-рейке", f(r.w) + " мм", f(p.w) + " мм", "warn", "шире на " + f(dw) + " мм — проверьте место на рейке", 1);
    } else if (p.w == null) {
      add("Ширина на DIN-рейке", r.w != null ? f(r.w) + " мм" : "нет данных", "уточняется", "warn", "габариты модели TettaPRO уточняются — сверьте по каталогу", 0.6);
    } else {
      add("Ширина на DIN-рейке", "нет данных", f(p.w) + " мм", "unknown");
    }
    var hd = [];
    // Небольшая разница (до 10 мм) по высоте и глубине на монтаж обычно не влияет
    if (r.h != null && p.h != null && p.h > r.h + 10) hd.push("выше на " + f(Math.round(p.h - r.h)) + " мм");
    if (r.d != null && p.d != null && p.d > r.d + 10) hd.push("глубже на " + f(Math.round(p.d - r.d)) + " мм");
    if (r.h != null && r.d != null && p.h != null && p.d != null) {
      add("Высота × глубина", f(r.h) + " × " + f(r.d) + " мм", f(p.h) + " × " + f(p.d) + " мм", hd.length ? "warn" : "ok",
        hd.length ? hd.join(", ") + " — проверьте место в шкафу и до крышки" : "", hd.length ? 0.5 : 0);
    }

    // Параллельная работа, ККМ
    if (/да/i.test(r.par || "")) add("Параллельная работа", r.par, "не заявлена", "warn", "если блоки включены параллельно или с резервированием — нужна консультация", 2);
    if (/да/i.test(r.pfc || "")) add("ККМ (PFC)", "есть", "не заявлен", "info", "важно только при требованиях к коэффициенту мощности сети", 0.5);
    return c;
  };

  Engine.prototype.evaluate = function (r, p) {
    var checks = this.checks(r, p);
    var score = checks.reduce(function (s, x) { return s + x.weight; }, 0);
    var warns = checks.filter(function (x) { return x.status === "warn"; });
    return {
      product: p, checks: checks, score: score, warns: warns,
      level: warns.length ? "partial" : "full",
      levelText: warns.length ? "Замена с оговорками" : "Полная замена",
      load: r.power / p.power
    };
  };

  /*
   * Подбор аналога для референса.
   * { options: [ { items:[{product, qty}], eval, note } ], reason }
   */
  Engine.prototype.analogsFor = function (r) {
    var self = this;
    if (!r) return { options: [], reason: "Отсутствует референс оборудования" };
    if (!r.power || !r.voltage) return { options: [], reason: "Недостаточно данных для подбора: нужна мощность и выходное напряжение" };

    var sameV = this.products.filter(function (p) { return Math.abs(p.voltage - r.voltage) < 0.01; });
    if (!sameV.length) {
      var vs = {};
      this.products.forEach(function (p) { vs[p.voltage] = 1; });
      return { options: [], reason: "TettaPRO выпускает блоки питания на " + Object.keys(vs).join(", ") + " В DC — для выхода " + f(r.voltage) + " В аналога в линейке нет" };
    }
    var cands = sameV.filter(function (p) { return p.power >= r.power - 0.5 && (r.current == null || p.current >= r.current - 0.01); });
    if (!cands.length) {
      var maxP = Math.max.apply(null, sameV.map(function (p) { return p.power; }));
      return { options: [], reason: "Мощность " + f(r.power) + " Вт больше, чем у самой мощной модели TettaPRO " + f(r.voltage) + " В (" + f(maxP) + " Вт)" };
    }
    var evals = cands.map(function (p) { return self.evaluate(r, p); });
    // ближайшая мощность, затем меньше оговорок, затем меньше ширина
    evals.sort(function (a, b) {
      return a.product.power - b.product.power || a.score - b.score || (a.product.w || 999) - (b.product.w || 999);
    });
    var minP = evals[0].product.power;
    var tier = evals.filter(function (e) { return e.product.power === minP; });
    var best = tier[0];
    var options = [{ e: best, note: best.level === "full" ? "Ближайшая по мощности, без оговорок" : "Ближайшая по мощности" }];

    // Вариант без оговорок (или с меньшими), если у рекомендованной они есть
    if (best.score > 0) {
      var better = evals.filter(function (e) { return e !== best && e.score < best.score && e.product.power <= Math.max(r.power * 4, minP * 2); })
        .sort(function (a, b) { return a.score - b.score || a.product.power - b.product.power; })[0];
      if (better) options.push({ e: better, note: better.score === 0 ? "Без оговорок" : "Меньше оговорок" });
    }
    // Вариант с запасом по мощности
    if (best.load > this.margin) {
      var used = options.map(function (o) { return o.e.product; });
      var bigger = evals.filter(function (e) { return e.product.power > minP && used.indexOf(e.product) === -1; })[0];
      if (bigger) options.push({ e: bigger, note: "С запасом по мощности" });
    }
    return {
      options: options.slice(0, 3).map(function (o) { return { items: [{ product: o.e.product, qty: 1 }], eval: o.e, note: o.note }; }),
      reason: ""
    };
  };

  /* Подбор по параметрам, когда артикула нет в базе (пакетный режим) */
  Engine.prototype.analogsByParams = function (power, voltage, current) {
    var r = prep({ a: "—", m: "", p: power, v: voltage, i: current }, "x");
    if (!r.power && r.current && r.voltage) r.power = r.current * r.voltage;
    return this.analogsFor(r);
  };

  root.TettaEngine = Engine;
  Engine.norm = norm;
  Engine.num = num;
  Engine.fmt = f;
  if (typeof module !== "undefined" && module.exports) module.exports = Engine;
})(typeof window !== "undefined" ? window : globalThis);
