/* Админка: база аналогов <-> Excel */
(function () {
  "use strict";
  var DB = window.TETTA_DB;
  var $ = function (s) { return document.querySelector(s); };
  var REF_HEAD = ["Артикул", "Наименование", "Серия", "Производитель", "Мощность, Вт", "Напряжение, В", "Ток, А", "Аналоги (вручную)"];
  var PROD_KEYS = ["article", "name", "series", "power", "voltage", "current", "input", "efficiency", "size", "temp", "dcok", "warranty", "image", "url"];
  var PROD_HEAD = ["Артикул", "Наименование", "Серия", "Мощность, Вт", "Напряжение, В", "Ток, А", "Вход", "КПД", "Габариты", "Рабочая температура", "DC OK", "Гарантия", "Картинка", "Ссылка"];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function stats(db) {
    var e = new TettaEngine(db, window.TETTA_CONFIG);
    var found = e.refs.filter(function (r) { return e.analogsFor(r).options.length; }).length;
    var man = {}; e.refs.forEach(function (r) { man[r.manufacturer] = 1; });
    $("#stats").innerHTML = [["Моделей TETTAPRO", e.products.length], ["Референсов", e.refs.length], ["Производителей", Object.keys(man).length], ["С аналогом", found + " из " + e.refs.length], ["Обновлено", db.updated || "—"]]
      .map(function (s) { return '<div class="stat"><span class="muted small">' + s[0] + "</span><b>" + esc(s[1]) + "</b></div>"; }).join("");
  }
  stats(DB);

  function analogsToText(a) {
    if (!Array.isArray(a)) return "";
    if (!a.length) return "-";
    return a.map(function (opt) {
      var list = Array.isArray(opt[0]) ? opt : [opt];
      return list.map(function (x) { return x[0] + (x[1] > 1 ? "*" + x[1] : ""); }).join("+");
    }).join("; ");
  }
  function textToAnalogs(t) {
    t = String(t || "").trim();
    if (!t) return undefined;
    if (t === "-" || t === "—") return [];
    return t.split(";").map(function (opt) {
      var list = opt.split("+").map(function (x) {
        var m = x.trim().split("*");
        return [m[0].trim(), parseFloat(m[1]) || 1];
      }).filter(function (x) { return x[0]; });
      return list.length === 1 ? list[0] : list;
    }).filter(function (o) { return o.length; });
  }

  $("#dl-db").addEventListener("click", function () {
    var refs = [REF_HEAD].concat(DB.references.map(function (r) {
      var o = Array.isArray(r) ? r : [r.article, r.name, r.series, r.manufacturer, r.power, r.voltage, r.current, r.analogs];
      return [o[0], o[1], o[2], o[3], o[4], o[5], o[6], analogsToText(o[7])];
    }));
    var prods = [PROD_HEAD].concat(DB.products.map(function (p) { return PROD_KEYS.map(function (k) { return p[k]; }); }));
    var wb = XLSX.utils.book_new();
    var ws1 = XLSX.utils.aoa_to_sheet(refs); ws1["!cols"] = [{ wch: 22 }, { wch: 52 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 13 }, { wch: 9 }, { wch: 30 }];
    var ws2 = XLSX.utils.aoa_to_sheet(prods); ws2["!cols"] = PROD_HEAD.map(function () { return { wch: 20 }; });
    XLSX.utils.book_append_sheet(wb, ws1, "Референсы");
    XLSX.utils.book_append_sheet(wb, ws2, "TETTAPRO");
    XLSX.writeFile(wb, "база_аналогов_TETTAPRO_" + new Date().toISOString().slice(0, 10) + ".xlsx");
  });

  $("#up-db").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      var errors = [];
      try {
        var wb = XLSX.read(new Uint8Array(fr.result), { type: "array" });
        var refSheet = wb.Sheets["Референсы"] || wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(refSheet, { header: 1, defval: "" });
        var head = rows[0].map(String);
        var miss = REF_HEAD.slice(0, 6).filter(function (h) { return head.indexOf(h) === -1; });
        if (miss.length) throw new Error("Отсутствуют обязательные колонки: " + miss.join(", "));
        var idx = REF_HEAD.map(function (h) { return head.indexOf(h); });
        var products = DB.products;
        if (wb.Sheets["TETTAPRO"]) {
          var pr = XLSX.utils.sheet_to_json(wb.Sheets["TETTAPRO"], { header: 1, defval: "" });
          var ph = pr[0].map(String);
          products = pr.slice(1).filter(function (r) { return String(r[0]).trim(); }).map(function (r) {
            var o = {};
            PROD_KEYS.forEach(function (k, i) { var j = ph.indexOf(PROD_HEAD[i]); o[k] = j >= 0 ? r[j] : ""; });
            ["power", "voltage", "current"].forEach(function (k) { o[k] = TettaEngine.num(o[k]); });
            return o;
          });
        }
        var known = {}; products.forEach(function (p) { known[TettaEngine.norm(p.article)] = 1; });
        var seen = {};
        var refs = [];
        rows.slice(1).forEach(function (r, i) {
          var cell = function (k) { return idx[k] >= 0 ? r[idx[k]] : ""; };
          var art = String(cell(0)).trim();
          if (!art) return;
          var line = i + 2;
          var p = TettaEngine.num(cell(4)), v = TettaEngine.num(cell(5)), c = TettaEngine.num(cell(6));
          if (seen[TettaEngine.norm(art)]) errors.push("Строка " + line + ": повтор артикула " + art);
          seen[TettaEngine.norm(art)] = 1;
          var an = textToAnalogs(cell(7));
          if (an === undefined && (!p || !v)) errors.push("Строка " + line + " (" + art + "): нет мощности или напряжения — аналог не подберётся");
          (an || []).forEach(function (o) { (Array.isArray(o[0]) ? o : [o]).forEach(function (x) { if (!known[TettaEngine.norm(x[0])]) errors.push("Строка " + line + ": неизвестная модель TETTAPRO " + x[0]); }); });
          var row = [art, String(cell(1)).trim(), String(cell(2)).trim(), String(cell(3)).trim(), p, v, c];
          if (an !== undefined) row.push(an);
          refs.push(row);
        });
        var newDb = { updated: new Date().toISOString().slice(0, 10), products: products, references: refs };
        var js = "/* База системы подбора аналогов TETTAPRO. Сгенерировано в admin.html " + newDb.updated + ". Формат описан в README.md */\n" +
          "window.TETTA_DB = " + JSON.stringify(newDb, null, 1).replace(/\n\s+(?=[\d\-"\]])/g, " ") + ";\n";
        var blob = new Blob([js], { type: "text/javascript" });
        var url = URL.createObjectURL(blob);
        stats(newDb);
        $("#result").innerHTML = '<p style="margin-top:16px"><b>Файл успешно загружен!</b> Референсов: ' + refs.length + ". " +
          '<a class="btn btn-primary" href="' + url + '" download="db.js">Скачать db.js</a></p>' +
          (errors.length ? '<p class="muted">Файл загружен с ошибками: ' + errors.length + " проблем найдено</p>" + errors.slice(0, 50).map(function (x) { return '<p class="err">' + esc(x) + "</p>"; }).join("") : "");
      } catch (err) {
        $("#result").innerHTML = '<div class="not-found" style="margin-top:16px"><b>Не удалось обработать файл</b><p>' + esc(err.message) + "</p></div>";
      }
      e.target.value = "";
    };
    fr.readAsArrayBuffer(f);
  });
})();
