@echo off
chcp 65001 >nul
rem Запуск сайта подбора аналогов TETTAPRO на этом компьютере (нужен Node.js: https://nodejs.org)
cd /d "%~dp0"
start "" http://localhost:8787
node server.cjs
pause
