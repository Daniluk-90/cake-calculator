/* Логика подбора: поиск по базе и выбор аналога TETTAPRO. Без зависимостей. */
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
    var n = parseFloat(String(v).replace(",", ".").replace(/[^\d.\-]/g, ""));
    return isFinite(n) ? n : null;
  }

  function Engine(db, cfg) {
    cfg = cfg || {};
    this.margin = cfg.marginThreshold || 0.8;
    this.products = (db.products || []).slice();
    this.byProduct = {};
    var self = this;
    this.products.forEach(function (p) { self.byProduct[norm(p.article)] = p; });

    this.refs = (db.references || []).map(function (r, i) {
      var o = Array.isArray(r)
        ? { article: r[0], name: r[1], series: r[2], manufacturer: r[3], power: r[4], voltage: r[5], current: r[6], analogs: r[7] }
        : Object.assign({}, r);
      o.id = i;
      o.power = num(o.power); o.voltage = num(o.voltage); o.current = num(o.current);
      o._a = norm(o.article);
      o._hay = (o.article + " " + o.name + " " + o.series + " " + o.manufacturer).toLowerCase().replace(/ё/g, "е");
      o._hayN = norm(o._hay);
      return o;
    });
    this.byRef = {};
    this.refs.forEach(function (r) { if (!self.byRef[r._a]) self.byRef[r._a] = r; });

    // серии: ключ — производитель + серия
    var lines = {};
    this.refs.forEach(function (r) {
      var key = r.manufacturer + " · " + r.series;
      if (!lines[key]) lines[key] = { key: key, series: r.series, manufacturer: r.manufacturer, items: [] };
      lines[key].items.push(r);
    });
    this.lines = Object.keys(lines).map(function (k) { return lines[k]; });
  }

  /* Поиск: возвращает группы ref / line / desc, как в оригинальном сервисе */
  Engine.prototype.search = function (q, limit) {
    limit = limit || 8;
    var nq = norm(q), ws = words(q);
    var res = { ref: [], line: [], desc: [] };
    if (nq.length < 2) return res;
    var allWords = function (hay) { return ws.every(function (w) { return hay.indexOf(w) !== -1 || norm(hay).indexOf(norm(w)) !== -1; }); };

    // Референсы — по артикулу
    var refHits = this.refs.filter(function (r) { return r._a.indexOf(nq) !== -1; });
    refHits.sort(function (a, b) {
      var sa = a._a.indexOf(nq) === 0 ? 0 : 1, sb = b._a.indexOf(nq) === 0 ? 0 : 1;
      return sa - sb || a._a.length - b._a.length;
    });
    res.ref = refHits.slice(0, limit);

    // Серии — по названию серии/производителя и продуктам внутри
    res.line = this.lines.filter(function (l) {
      return norm(l.series).indexOf(nq) !== -1 || allWords((l.manufacturer + " " + l.series).toLowerCase()) ||
        l.items.some(function (r) { return r._a.indexOf(nq) !== -1; });
    }).slice(0, limit);

    // Наименование — по словам в названии/описании
    var refIds = {};
    res.ref.forEach(function (r) { refIds[r.id] = 1; });
    res.desc = this.refs.filter(function (r) { return !refIds[r.id] && allWords(r._hay); }).slice(0, limit);
    return res;
  };

  Engine.prototype.lineOf = function (ref) {
    var key = ref.manufacturer + " · " + ref.series;
    return this.lines.filter(function (l) { return l.key === key; })[0] || null;
  };
  Engine.prototype.findRef = function (article) { return this.byRef[norm(article)] || null; };
  Engine.prototype.findProduct = function (article) { return this.byProduct[norm(article)] || null; };

  /*
   * Подбор аналога.
   * Возвращает { options: [ { items: [ {product, qty} ], note } ], reason }
   * options пустой — аналог не найден (reason объясняет почему).
   */
  Engine.prototype.analogsFor = function (ref) {
    var self = this;
    if (!ref) return { options: [], reason: "Отсутствует референс оборудования" };

    // Ручная замена из базы
    if (Array.isArray(ref.analogs)) {
      var opts = ref.analogs.map(function (a) {
        var list = Array.isArray(a[0]) ? a : [a];  // вариант из нескольких позиций: [["A",1],["B",1]]
        return { items: list.map(function (x) { return { product: self.findProduct(x[0]), qty: num(x[1]) || 1 }; }).filter(function (x) { return x.product; }), note: "" };
      }).filter(function (o) { return o.items.length; });
      return { options: opts, reason: opts.length ? "" : "Аналог для этой позиции не предусмотрен" };
    }
    return this.analogsByParams(ref.power, ref.voltage, ref.current);
  };

  Engine.prototype.analogsByParams = function (power, voltage, current) {
    var margin = this.margin;
    if (!power && current && voltage) power = current * voltage;
    if (!power || !voltage) return { options: [], reason: "Недостаточно данных для подбора: нужна мощность и выходное напряжение" };
    var c = this.products.filter(function (p) {
      return Math.abs(p.voltage - voltage) < 0.01 && p.power >= power - 0.5 && (!current || p.current >= current - 0.01);
    }).sort(function (a, b) { return a.power - b.power; });
    if (!c.length) {
      var sameV = this.products.some(function (p) { return Math.abs(p.voltage - voltage) < 0.01; });
      return { options: [], reason: sameV
        ? "Мощность " + power + " Вт превышает мощность моделей TETTAPRO " + voltage + " В"
        : "В линейке TETTAPRO нет источников питания с выходным напряжением " + voltage + " В" };
    }
    var options = [{ items: [{ product: c[0], qty: 1 }], note: c[0].power === power ? "Совпадает по мощности" : "Ближайшая модель по мощности" }];
    if (c[1] && power > c[0].power * margin) {
      options.push({ items: [{ product: c[1], qty: 1 }], note: "С запасом по мощности" });
    }
    return { options: options, reason: "" };
  };

  root.TettaEngine = Engine;
  root.TettaEngine.norm = norm;
  root.TettaEngine.num = num;
  if (typeof module !== "undefined" && module.exports) module.exports = Engine;
})(typeof window !== "undefined" ? window : globalThis);
