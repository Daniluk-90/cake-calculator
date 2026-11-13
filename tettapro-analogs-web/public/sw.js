// Офлайн-режим: страница и файлы берутся из кэша, таблица — всегда с сервера (с запасной копией в браузере).
const CACHE = "tettapro-analogs-v1";
const FILES = ["./", "index.html", "styles.css", "app.js", "search.js", "config.js", "default-table.js",
  "vendor/xlsx.full.min.js", "img/logo-dark.svg", "img/favicon.png", "img/icon-192.png",
  "fonts/manrope-cyrillic-wght-normal.woff2", "fonts/manrope-latin-wght-normal.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Сначала сеть (чтобы обновления сайта приходили сразу), при ошибке — кэш.
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
