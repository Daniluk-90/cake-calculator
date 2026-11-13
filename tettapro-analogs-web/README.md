# Подбор аналогов TETTAPRO — сайт и общая таблица

Один интерфейс и одна таблица для сайта и программ Windows/Mac (`../tettapro-analogs-desktop`).

- `public/` — сайт (тот же интерфейс встраивается в программы при сборке).
- `netlify/functions/table.mjs` — API `/api/table`: GET отдаёт текущую таблицу, POST загружает новую (с паролем).
  Таблица хранится в Netlify Blobs (хранилище `tettapro-analogs`, ключ `current`, прошлые версии — `history/…`).

## Как это работает
Сайт и программы при запуске, при переключении на окно и каждые 5 минут берут таблицу с `/api/table`.
«Загрузить таблицу…» (на сайте или в программе) отправляет Excel-файл на сервер — после этого новая таблица
действует везде. Без связи программа работает по последней сохранённой таблице.

## Размещение на Netlify (один раз)
1. Netlify → Add new site → Import from Git → этот репозиторий.
2. Base directory: `tettapro-analogs-web` (publish `public` и функции подхватятся из `netlify.toml`).
3. Site name: `tettapro-analogs` → адрес `https://tettapro-analogs.netlify.app`
   (если имя другое — укажите его в переменной репозитория GitHub `TETTA_API_BASE` и пересоберите программы).
4. Site configuration → Environment variables → `ADMIN_PASSWORD` = пароль для загрузки таблиц.

## Локальная проверка
```
npm install
node test/dev-server.mjs   # http://localhost:8787, пароль test123, хранилище в памяти
```
