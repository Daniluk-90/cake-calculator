/*
 * Чтение таблицы «Блоки питания DIN» (Excel) в формат базы TETTA_DB.
 * Используется в admin.html (браузер) и в tools/build-db.js (Node).
 *
 * Строки с производителем TettaPRO становятся моделями для подбора (products),
 * все остальные — референсами (references).
 */
(function (root) {
  "use strict";

  // Колонки таблицы -> короткие ключи базы
  var COLUMNS = [
    ["m", "Производитель"],
    ["a", "Артикул"],
    ["s", "Серия"],
    ["t", "Тип"],
    ["p", "Мощность, Вт", "num"],
    ["v", "Вых. напряжение, В", "num"],
    ["i", "Вых. ток (ном.), А", "num"],
    ["imax", "Вых. ток макс., А", "num"],
    ["ipk", "Пиковый ток, А", "num"],
    ["adj", "Регулировка выхода"],
    ["ac", "Вход AC, В"],
    ["dc", "Вход DC, В"],
    ["hz", "Частота, Гц"],
    ["ph", "Фазность входа"],
    ["pfc", "ККМ (PFC)"],
    ["par", "Параллельная работа"],
    ["iso", "Изоляция, В AC", "num"],
    ["mnt", "Монтаж"],
    ["w", "Ширина, мм", "num"],
    ["h", "Высота, мм", "num"],
    ["d", "Глубина, мм", "num"],
    ["tmin", "Т раб. мин, °C", "num"],
    ["tmax", "Т раб. макс, °C", "num"],
    ["note", "Примечание"],
    ["desc", "Описание на сайте"],
    ["src", "Источник (официальный сайт)"]
  ];
  var REQUIRED = ["Производитель", "Артикул", "Мощность, Вт", "Вых. напряжение, В"];
  var OWN_BRAND = /^tetta\s*pro$/i;

  function num(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    var s = String(v).replace(/\s/g, "").replace(",", ".").replace(/[−–—]/g, "-");
    var m = s.match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  function key(m, a) {
    return (String(m) + "|" + String(a)).toLowerCase().replace(/ё/g, "е").replace(/[\s\-_./\\(),]+/g, "");
  }
  function filled(o) {
    return Object.keys(o).filter(function (k) { return o[k] !== "" && o[k] != null; }).length;
  }

  /*
   * aoa — массив строк листа (первая строка с заголовками ищется сама).
   * Возвращает { db, errors, warnings }.
   */
  function parseSheet(aoa) {
    var errors = [], warnings = [];
    var hi = -1;
    for (var r = 0; r < Math.min(aoa.length, 15); r++) {
      var row = aoa[r].map(function (c) { return String(c).trim(); });
      if (row.indexOf("Артикул") !== -1 && row.indexOf("Производитель") !== -1) { hi = r; break; }
    }
    if (hi === -1) return { db: null, errors: ["Отсутствуют обязательные колонки: " + REQUIRED.join(", ")], warnings: [] };
    var head = aoa[hi].map(function (c) { return String(c).trim(); });
    var miss = REQUIRED.filter(function (h) { return head.indexOf(h) === -1; });
    if (miss.length) return { db: null, errors: ["Отсутствуют обязательные колонки: " + miss.join(", ")], warnings: [] };
    var idx = COLUMNS.map(function (c) { return head.indexOf(c[1]); });

    var seen = {}, products = [], refs = [];
    aoa.slice(hi + 1).forEach(function (row, n) {
      var line = hi + n + 2;
      var o = {};
      COLUMNS.forEach(function (c, j) {
        var v = idx[j] >= 0 ? row[idx[j]] : "";
        if (c[2] === "num") v = num(v);
        else v = v == null ? "" : String(v).trim();
        if (v !== "" && v != null) o[c[0]] = v;
      });
      if (!o.a || !o.m) return;
      if (o.p == null || o.v == null) { warnings.push("Строка " + line + " (" + o.m + " " + o.a + "): нет мощности или напряжения — пропущена"); return; }
      if (o.i == null && o.p && o.v) o.i = Math.round(o.p / o.v * 100) / 100;
      var k = key(o.m, o.a);
      if (seen[k]) {
        // повтор: оставляем строку, где заполнено больше полей
        if (filled(o) > filled(seen[k])) { Object.keys(seen[k]).forEach(function (x) { delete seen[k][x]; }); Object.assign(seen[k], o); }
        warnings.push("Строка " + line + ": повтор " + o.m + " " + o.a + " — оставлена более полная запись");
        return;
      }
      seen[k] = o;
      (OWN_BRAND.test(o.m) ? products : refs).push(o);
    });
    if (!products.length) errors.push("В таблице нет строк с производителем TettaPRO — не на что подбирать замену");
    return {
      db: { updated: new Date().toISOString().slice(0, 10), products: products, references: refs },
      errors: errors, warnings: warnings
    };
  }

  /* База -> строки для Excel (тот же формат, что и исходная таблица) */
  function toSheet(db) {
    var aoa = [COLUMNS.map(function (c) { return c[1]; })];
    db.products.concat(db.references).forEach(function (o) {
      aoa.push(COLUMNS.map(function (c) { return o[c[0]] == null ? "" : o[c[0]]; }));
    });
    return aoa;
  }

  function toJs(db) {
    var lines = ["/* База системы подбора аналогов TETTAPRO. Сгенерировано из таблицы «Блоки питания DIN» " + db.updated + ".",
      "   Не правьте вручную: меняйте Excel и пересоберите базу в admin.html или командой node tools/build-db.js */",
      "window.TETTA_DB = {", '"updated": ' + JSON.stringify(db.updated) + ",", '"products": ['];
    lines.push(db.products.map(function (o) { return JSON.stringify(o); }).join(",\n"));
    lines.push("],", '"references": [');
    lines.push(db.references.map(function (o) { return JSON.stringify(o); }).join(",\n"));
    lines.push("]};", "");
    return lines.join("\n");
  }

  var api = { parseSheet: parseSheet, toSheet: toSheet, toJs: toJs, COLUMNS: COLUMNS, num: num };
  root.TettaDbFormat = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
