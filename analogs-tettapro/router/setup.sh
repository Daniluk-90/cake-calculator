#!/bin/sh
# Установка сайта «Подбор аналогов TettaPRO» на роутер ASUS с прошивкой Asuswrt-Merlin.
#
# Что делает:
#   1. ставит веб-сервер lighttpd из Entware;
#   2. раздаёт папку сайта (ту, где лежит этот скрипт) на порту 8088;
#   3. открывает сайт из интернета: порт 8088 и обычный порт 80 (перенаправляется на 8088);
#   4. закрывает из интернета служебные файлы: admin.html, tools/, router/, Excel-таблицу базы;
#   5. всё переживает перезагрузку роутера.
#
# Запуск (по SSH, например из приложения Termius на iPhone):
#   sh /tmp/mnt/<имя флешки>/analogs-tettapro/router/setup.sh
# Повторный запуск безопасен. Удаление: sh .../router/setup.sh uninstall
#
# Требуется: Asuswrt-Merlin, USB-флешка с Entware (amtm → ep),
# включено «Администрирование → Система → Enable JFFS custom scripts and configs».

PORT=8088          # порт веб-сервера
OPEN_PORT_80=1     # 1 — сайт доступен без порта (http://имя.asuscomm.com), 0 — только с :8088

set -e
export PATH="/opt/bin:/opt/sbin:$PATH"
SITE_DIR=$(cd "$(dirname "$0")/.." && pwd)
CONF=/opt/etc/lighttpd/lighttpd.conf
MARK="# tettapro-analogs"

say()  { printf '\n\033[1;32m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mОШИБКА: %s\033[0m\n' "$1"; exit 1; }

# --- удаление -------------------------------------------------------------
if [ "$1" = "uninstall" ]; then
  say "Удаляю настройки сайта"
  [ -x /opt/etc/init.d/S80lighttpd ] && /opt/etc/init.d/S80lighttpd stop || true
  for f in /jffs/scripts/firewall-start /jffs/scripts/nat-start; do
    [ -f "$f" ] && sed -i "/$MARK/d" "$f"
  done
  iptables -D INPUT -p tcp --dport $PORT -j ACCEPT 2>/dev/null || true
  service restart_firewall >/dev/null 2>&1 || true
  echo "Готово. Веб-сервер остановлен, правила удалены. Пакет lighttpd можно удалить: opkg remove lighttpd"
  exit 0
fi

# --- проверки -------------------------------------------------------------
say "Проверяю роутер"
[ -f "$SITE_DIR/index.html" ] || fail "Не найден index.html в $SITE_DIR. Скопируйте папку сайта на флешку целиком."
[ -x /opt/bin/opkg ] || fail "Entware не установлен. Выполните amtm, выберите пункт ep (Entware) и запустите скрипт снова."
[ "$(nvram get jffs2_scripts)" = "1" ] || {
  echo "Включаю пользовательские скрипты JFFS (нужны для автозапуска правил)…"
  nvram set jffs2_scripts=1; nvram commit
}
mkdir -p /jffs/scripts
case "$SITE_DIR" in /tmp/mnt/*) ;; *) echo "Внимание: сайт лежит не на флешке ($SITE_DIR)." ;; esac
echo "Папка сайта: $SITE_DIR"

# --- веб-сервер -----------------------------------------------------------
say "Устанавливаю lighttpd"
opkg update >/dev/null
opkg install lighttpd >/dev/null
opkg install lighttpd-mod-deflate >/dev/null 2>&1 || echo "  (сжатие недоступно — сайт будет работать без него)"
# mod_access и mod_setenv в новых версиях встроены (отдельного .so нет), mod_deflate — отдельный модуль.
# Поэтому конфигурация собирается с ними и проверяется; если версия их не знает — без них.
has_so() { [ -f "/opt/lib/lighttpd/$1.so" ]; }

write_conf() { # $1 — подключать mod_access/mod_setenv (1/0)
MODS='"mod_indexfile", "mod_staticfile"'
[ "$1" = "1" ] && MODS="\"mod_access\", $MODS, \"mod_setenv\""
has_so mod_deflate && MODS="$MODS, \"mod_deflate\""

cat > "$CONF" <<EOF
$MARK — создано router/setup.sh, перезаписывается при повторном запуске
server.modules = ( $MODS )
server.document-root = "$SITE_DIR"
server.port = $PORT
server.errorlog = "/opt/var/log/lighttpd-error.log"
server.pid-file = "/opt/var/run/lighttpd.pid"
server.tag = ""
index-file.names = ( "index.html" )
mimetype.assign = (
  ".html" => "text/html; charset=utf-8",
  ".css"  => "text/css; charset=utf-8",
  ".js"   => "text/javascript; charset=utf-8",
  ".json" => "application/json",
  ".webmanifest" => "application/manifest+json",
  ".svg"  => "image/svg+xml",
  ".png"  => "image/png",
  ".webp" => "image/webp",
  ".ico"  => "image/x-icon",
  ".woff2" => "font/woff2",
  ".md"   => "text/plain; charset=utf-8",
  ""      => "application/octet-stream"
)
EOF
if [ "$1" = "1" ]; then cat >> "$CONF" <<'EOF'
# Служебные файлы не отдаются никому (админка открывается локально с компьютера)
$HTTP["url"] =~ "^/(admin\.html|assets/admin\.js|tools/|router/|data/.*\.xlsx|README\.md)" { url.access-deny = ( "" ) }
$HTTP["url"] =~ "/\." { url.access-deny = ( "" ) }
# База (data/db.js) обновляется — проверять свежесть при каждом открытии
setenv.add-response-header = ( "X-Content-Type-Options" => "nosniff" )
$HTTP["url"] =~ "\.(html|js|webmanifest)$" { setenv.add-response-header += ( "Cache-Control" => "no-cache" ) }
$HTTP["url"] =~ "\.(png|webp|svg|woff2|css)$" { setenv.add-response-header += ( "Cache-Control" => "public, max-age=86400" ) }
EOF
fi
if has_so mod_deflate; then cat >> "$CONF" <<'EOF'
# Сжатие: база 400 КБ уходит на телефон примерно как 60 КБ
deflate.mimetypes = ( "text/html", "text/css", "text/javascript", "application/json", "image/svg+xml", "application/manifest+json" )
deflate.allowed-encodings = ( "gzip", "deflate" )
EOF
fi
}

say "Пишу настройки веб-сервера"
[ -f "$CONF" ] && ! grep -q "$MARK" "$CONF" && cp "$CONF" "$CONF.orig"
mkdir -p /opt/var/log /opt/var/run
write_conf 1
if ! /opt/sbin/lighttpd -tt -f "$CONF" >/tmp/lighttpd-check.log 2>&1; then
  write_conf 0
  /opt/sbin/lighttpd -tt -f "$CONF" || { cat /tmp/lighttpd-check.log; fail "Ошибка в настройках lighttpd (см. выше)."; }
  echo "  Внимание: эта версия lighttpd не умеет закрывать отдельные файлы."
  echo "  Удалите с флешки admin.html, папки tools и router, если не хотите, чтобы их видели из интернета."
fi

say "Запускаю веб-сервер"
/opt/etc/init.d/S80lighttpd restart >/dev/null 2>&1 || /opt/etc/init.d/S80lighttpd start
sleep 1
pidof lighttpd >/dev/null || fail "lighttpd не запустился. Журнал: /opt/var/log/lighttpd-error.log"

# --- доступ из интернета --------------------------------------------------
say "Открываю доступ из интернета"
add_line() { # файл, строка
  f=$1; line="$2 $MARK"
  [ -f "$f" ] || printf '#!/bin/sh\n' > "$f"
  sed -i "/$MARK/d" "$f"
  echo "$line" >> "$f"
  chmod 755 "$f"
}
add_line /jffs/scripts/firewall-start "iptables -I INPUT -p tcp --dport $PORT -j ACCEPT"
if [ "$OPEN_PORT_80" = "1" ]; then
  add_line /jffs/scripts/nat-start "iptables -t nat -I PREROUTING -i \$(nvram get wan0_gw_ifname) -p tcp --dport 80 -j REDIRECT --to-ports $PORT"
else
  [ -f /jffs/scripts/nat-start ] && sed -i "/$MARK/d" /jffs/scripts/nat-start
fi
service restart_firewall >/dev/null 2>&1 || true
sleep 2

# --- итог -----------------------------------------------------------------
LAN=$(nvram get lan_ipaddr)
WANIP=$(nvram get wan0_ipaddr)
DDNS=$(nvram get ddns_hostname_x)
[ "$(nvram get ddns_enable_x)" = "1" ] || DDNS=""

say "Готово!"
echo "Внутри сети:    http://$LAN:$PORT"
if [ -n "$DDNS" ]; then
  [ "$OPEN_PORT_80" = "1" ] && echo "Из интернета:   http://$DDNS" || echo "Из интернета:   http://$DDNS:$PORT"
else
  echo "Из интернета:   включите DDNS (WAN → DDNS), имя вида tettapro.asuscomm.com"
fi
case "$WANIP" in
  10.*|100.6[4-9].*|100.[7-9]?.*|100.1[01]?.*|100.12[0-7].*|172.1[6-9].*|172.2?.*|172.3[01].*|192.168.*)
    echo
    echo "ВНИМАНИЕ: внешний адрес роутера $WANIP — «серый» (за NAT провайдера)."
    echo "Из интернета сайт открываться не будет. Попросите у провайдера белый (публичный) IP-адрес." ;;
esac
echo
echo "Обновить сайт: замените файлы в папке на флешке через приложение «Файлы». Перезапуск не нужен."
