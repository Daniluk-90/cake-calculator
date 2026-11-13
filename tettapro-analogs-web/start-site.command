#!/bin/bash
# Запуск сайта подбора аналогов TETTAPRO на этом компьютере (нужен Node.js: https://nodejs.org)
cd "$(dirname "$0")"
(sleep 1; open http://localhost:8787) &
node server.cjs
