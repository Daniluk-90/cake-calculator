#!/bin/sh
# Установка сайта «Подбор аналогов TettaPRO» на роутер с OpenWrt.
#
# Запуск (из распакованной папки сайта, например /tmp/analogs-tettapro):
#   sh /tmp/analogs-tettapro/router/openwrt-setup.sh                  — только сайт
#   sh /tmp/analogs-tettapro/router/openwrt-setup.sh ИМЯ ТОКЕН        — сайт + адрес ИМЯ.duckdns.org
#   sh /tmp/analogs-tettapro/router/openwrt-setup.sh uninstall        — убрать сайт
#
# Что делает:
#   1. копирует файлы сайта в постоянную память роутера (/srv/tettapro) или на USB-флешку,
#      если во встроенной памяти мало места; служебные файлы (admin.html, Excel, скрипты) не копируются;
#   2. запускает второй экземпляр встроенного веб-сервера uhttpd на порту 8088 (LuCI не затрагивается);
#   3. открывает сайт из интернета: порт 8088 и обычный порт 80 (перенаправляется на 8088);
#   4. по желанию настраивает бесплатный адрес ИМЯ.duckdns.org.
# Повторный запуск безопасен — так же обновляется сайт.

PORT=8088
OPEN_PORT_80=1          # 1 — сайт открывается без порта: http://имя.duckdns.org

SRC=$(cd "$(dirname "$0")/.." && pwd)
say()  { printf '\n\033[1;32m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mОШИБКА: %s\033[0m\n' "$1"; exit 1; }

pkg_install() { # пакеты OpenWrt: opkg (до 24.10) или apk (25.x)
  if command -v apk >/dev/null 2>&1; then apk update >/dev/null 2>&1; apk add "$@" >/dev/null 2>&1
  else opkg update >/dev/null 2>&1; opkg install "$@" >/dev/null 2>&1; fi
}

# --- удаление -------------------------------------------------------------
if [ "$1" = "uninstall" ]; then
  say "Убираю сайт"
  DIR=$(uci -q get uhttpd.tettapro.home)
  uci -q delete uhttpd.tettapro; uci commit uhttpd; /etc/init.d/uhttpd restart
  uci -q delete firewall.tettapro_web; uci -q delete firewall.tettapro_80; uci commit firewall; /etc/init.d/firewall reload >/dev/null 2>&1
  uci -q delete ddns.tettapro && { uci commit ddns; /etc/init.d/ddns restart >/dev/null 2>&1; }
  [ -n "$DIR" ] && [ -f "$DIR/index.html" ] && rm -rf "$DIR"
  echo "Готово: сайт, правила и DDNS удалены."
  exit 0
fi

[ -f /etc/openwrt_release ] || fail "Это не OpenWrt."
[ -f "$SRC/index.html" ] || fail "Не найден index.html в $SRC. Распакуйте архив целиком."
command -v uci >/dev/null || fail "Нет команды uci."

# --- куда положить сайт ---------------------------------------------------
say "Выбираю место для сайта"
NEED_KB=$(du -sk "$SRC" | awk '{print $1}')
free_kb() { df -k "$1" 2>/dev/null | awk 'NR==2 {print $4}'; }
DEST=""
OLD=$(uci -q get uhttpd.tettapro.home)
OVFREE=$(free_kb /overlay); [ -n "$OVFREE" ] || OVFREE=$(free_kb /)
if [ -n "$OLD" ] && [ -d "$OLD" ]; then
  DEST=$OLD                                                      # обновление — туда же
elif [ "${OVFREE:-0}" -gt $((NEED_KB + 1024)) ]; then
  DEST=/srv/tettapro                                             # встроенная память
else
  for m in /mnt/*; do                                            # USB-флешка
    [ -d "$m" ] && [ -w "$m" ] && [ "$(free_kb "$m")" -gt "$NEED_KB" ] 2>/dev/null && { DEST="$m/tettapro"; break; }
  done
fi
[ -n "$DEST" ] || fail "Мало места: нужно около $((NEED_KB / 1024 + 1)) МБ. Подключите USB-флешку (Система → Точки монтирования) и запустите снова."
echo "Сайт будет в: $DEST"

say "Копирую файлы сайта"
# служебное не копируем: админку, исходный Excel, скрипты сборки и установки, README
[ -f "$DEST/index.html" ] && rm -rf "$DEST"          # старая версия сайта
mkdir -p "$DEST/data" "$DEST/assets" || fail "Не удалось создать $DEST"
cp "$SRC/index.html" "$DEST/" && cp "$SRC/data/db.js" "$DEST/data/" && cp -r "$SRC/assets/." "$DEST/assets/" \
  || fail "Не удалось скопировать файлы (закончилось место?)"
[ -f "$SRC/site.webmanifest" ] && cp "$SRC/site.webmanifest" "$DEST/"
rm -f "$DEST/assets/admin.js" "$DEST/assets/dbformat.js"
find "$DEST" -type d -exec chmod 755 {} \; ; find "$DEST" -type f -exec chmod 644 {} \;
echo "Скопировано: $(du -sh "$DEST" | awk '{print $1}')"

# --- веб-сервер -----------------------------------------------------------
say "Настраиваю веб-сервер (uhttpd, порт $PORT)"
uci -q delete uhttpd.tettapro
uci set uhttpd.tettapro=uhttpd
uci set uhttpd.tettapro.home="$DEST"
uci add_list uhttpd.tettapro.listen_http="0.0.0.0:$PORT"
uci add_list uhttpd.tettapro.listen_http="[::]:$PORT"
uci set uhttpd.tettapro.index_page='index.html'
uci set uhttpd.tettapro.no_dirlists='1'
uci set uhttpd.tettapro.rfc1918_filter='0'
uci set uhttpd.tettapro.max_requests='20'
uci set uhttpd.tettapro.max_connections='100'
uci set uhttpd.tettapro.script_timeout='10'
uci set uhttpd.tettapro.network_timeout='30'
uci set uhttpd.tettapro.http_keepalive='20'
uci commit uhttpd
/etc/init.d/uhttpd restart
sleep 1
netstat -ltn 2>/dev/null | grep -q ":$PORT " || warn "Не вижу сервер на порту $PORT — проверьте: logread | grep uhttpd"

# --- доступ из интернета --------------------------------------------------
say "Открываю доступ из интернета"
uci -q delete firewall.tettapro_web
uci set firewall.tettapro_web=rule
uci set firewall.tettapro_web.name='Allow-TettaPRO-site'
uci set firewall.tettapro_web.src='wan'
uci set firewall.tettapro_web.proto='tcp'
uci set firewall.tettapro_web.dest_port="$PORT"
uci set firewall.tettapro_web.target='ACCEPT'
uci -q delete firewall.tettapro_80
if [ "$OPEN_PORT_80" = "1" ]; then
  uci set firewall.tettapro_80=redirect
  uci set firewall.tettapro_80.name='TettaPRO-site-80'
  uci set firewall.tettapro_80.src='wan'
  uci set firewall.tettapro_80.proto='tcp'
  uci set firewall.tettapro_80.src_dport='80'
  uci set firewall.tettapro_80.dest_port="$PORT"
  uci set firewall.tettapro_80.target='DNAT'
fi
uci commit firewall
/etc/init.d/firewall reload >/dev/null 2>&1

# --- адрес в интернете (DuckDNS) -----------------------------------------
NAME=$1; TOKEN=$2
if [ -n "$NAME" ] && [ -n "$TOKEN" ]; then
  NAME=${NAME%.duckdns.org}
  say "Настраиваю адрес $NAME.duckdns.org"
  [ -f /usr/lib/ddns/dynamic_dns_updater.sh ] || pkg_install ddns-scripts luci-app-ddns
  [ -f /usr/lib/ddns/dynamic_dns_updater.sh ] || fail "Не удалось установить ddns-scripts (нет интернета на роутере?)."
  uci -q delete ddns.tettapro
  uci set ddns.tettapro=service
  uci set ddns.tettapro.enabled='1'
  uci set ddns.tettapro.service_name='duckdns.org'
  uci set ddns.tettapro.lookup_host="$NAME.duckdns.org"
  uci set ddns.tettapro.domain="$NAME"
  uci set ddns.tettapro.username='NA'
  uci set ddns.tettapro.password="$TOKEN"
  uci set ddns.tettapro.use_https='0'
  uci set ddns.tettapro.ip_source='network'
  uci set ddns.tettapro.ip_network='wan'
  uci set ddns.tettapro.interface='wan'
  uci set ddns.tettapro.check_interval='10'
  uci set ddns.tettapro.check_unit='minutes'
  uci commit ddns
  /etc/init.d/ddns enable >/dev/null 2>&1
  /etc/init.d/ddns restart >/dev/null 2>&1
fi

# --- итог -----------------------------------------------------------------
LAN=$(uci -q get network.lan.ipaddr | cut -d/ -f1)
WANIP=$(ifstatus wan 2>/dev/null | jsonfilter -e '@["ipv4-address"][0].address' 2>/dev/null)
HOST=$(uci -q get ddns.tettapro.lookup_host)

say "Готово!"
echo "Внутри сети:   http://$LAN:$PORT"
if [ -n "$HOST" ]; then
  [ "$OPEN_PORT_80" = "1" ] && echo "Из интернета:  http://$HOST   (или http://$HOST:$PORT)" || echo "Из интернета:  http://$HOST:$PORT"
else
  echo "Из интернета:  http://${WANIP:-<внешний IP>}:$PORT   (имя сайта: запустите скрипт с ИМЯ и ТОКЕН от duckdns.org)"
fi
case "$WANIP" in
  10.*|100.6[4-9].*|100.[7-9][0-9].*|100.1[01][0-9].*|100.12[0-7].*|172.1[6-9].*|172.2[0-9].*|172.3[01].*|192.168.*)
    echo
    warn "ВНИМАНИЕ: внешний адрес роутера $WANIP — «серый» (за NAT провайдера или за другим роутером)."
    warn "Из интернета сайт открываться не будет. Нужен белый (публичный) IP от провайдера." ;;
esac
echo
echo "Обновить сайт: загрузите новый архив в /tmp и запустите эту же команду снова."
