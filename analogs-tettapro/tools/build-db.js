#!/usr/bin/env node
/*
 * Пересборка data/db.js из Excel-таблицы «Блоки питания DIN».
 *   node tools/build-db.js [путь к .xlsx]
 * По умолчанию берётся data/bloki-pitaniya-din.xlsx.
 * Нужен только Node.js — библиотека Excel лежит в assets/vendor.
 */
"use strict";
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var XLSX = require(path.join(root, "assets/vendor/xlsx.full.min.js"));
var fmt = require(path.join(root, "assets/dbformat.js"));

var src = process.argv[2] || path.join(root, "data/bloki-pitaniya-din.xlsx");
var wb = XLSX.read(fs.readFileSync(src), { type: "buffer" });
var name = wb.SheetNames.filter(function (n) { return /блоки питания/i.test(n); })[0] || wb.SheetNames[0];
var aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
var res = fmt.parseSheet(aoa);
res.warnings.forEach(function (w) { console.warn("! " + w); });
if (res.errors.length) { res.errors.forEach(function (e) { console.error("ОШИБКА: " + e); }); process.exit(1); }
fs.writeFileSync(path.join(root, "data/db.js"), fmt.toJs(res.db));
console.log("Готово: моделей TettaPRO " + res.db.products.length + ", референсов " + res.db.references.length + " -> data/db.js");
