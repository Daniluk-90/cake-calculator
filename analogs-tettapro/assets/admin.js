/* Админка: база аналогов <-> Excel (формат таблицы «Блоки питания DIN») */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var FMT = window.TettaDbFormat;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  function stats(db) {
    var e = new TettaEngine(db, window.TETTA_CONFIG);
    var full = 0, part = 0, none = 0;
    e.refs.forEach(function (r) {
      var o = e.analogsFor(r).options[0];
      if (!o) none++; else if (o.eval.level === "full") full++; else part++;
    });
    var man = {}; e.refs.forEach(function (r) { man[r.m] = 1; });
    $("#stats").innerHTML = [
      ["Моделей TettaPRO", e.products.length], ["Блоков других производителей", e.refs.length], ["Производителей", Object.keys(man).length],
      ["Полная замена", full], ["Замена с оговорками", part], ["Без аналога", none], ["Обновлено", db.updated || "—"]
    ].map(function (s) { return '<div class="stat"><span class="muted small">' + s[0] + "</span><b>" + esc(s[1]) + "</b></div>"; }).join("");
  }
  stats(window.TETTA_DB);

  $("#dl-db").addEventListener("click", function () {
    var aoa = FMT.toSheet(window.TETTA_DB);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = aoa[0].map(function (h) { return { wch: Math.max(10, Math.min(40, h.length + 2)) }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Блоки питания DIN");
    XLSX.writeFile(wb, "Блоки_питания_DIN_" + new Date().toISOString().slice(0, 10) + ".xlsx");
  });

  $("#up-db").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var wb = XLSX.read(new Uint8Array(fr.result), { type: "array" });
        var name = wb.SheetNames.filter(function (n) { return /блоки питания/i.test(n); })[0] || wb.SheetNames[0];
        var aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
        var res = FMT.parseSheet(aoa);
        if (res.errors.length) throw new Error(res.errors.join(" "));
        var url = URL.createObjectURL(new Blob([FMT.toJs(res.db)], { type: "text/javascript" }));
        stats(res.db);
        $("#result").innerHTML = '<p style="margin-top:16px"><b>Файл успешно загружен!</b> Лист «' + esc(name) + "»: моделей TettaPRO " + res.db.products.length +
          ", блоков других производителей " + res.db.references.length + '. <a class="btn btn-primary" href="' + url + '" download="db.js">Скачать db.js</a></p>' +
          (res.warnings.length ? '<p class="muted">Замечания: ' + res.warnings.length + "</p>" + res.warnings.slice(0, 80).map(function (x) { return '<p class="err">' + esc(x) + "</p>"; }).join("") : "");
      } catch (err) {
        $("#result").innerHTML = '<div class="not-found" style="margin-top:16px"><b>Не удалось обработать файл</b><p>' + esc(err.message) + "</p></div>";
      }
      e.target.value = "";
    };
    fr.readAsArrayBuffer(f);
  });
})();
