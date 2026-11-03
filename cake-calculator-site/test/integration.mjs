// Прогон main() против имитации TinyFish: node test/integration.mjs
import http from 'node:http';
import { mkdtemp, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const T = { 'Мука': ['Мука пшеничная высший сорт 1кг', 1], 'Сахар': ['Сахар-песок белый 1кг', 1], 'Яйца': ['Яйца куриные С1 10шт', 10, 'pcs'],
  'Сливочное масло': ['Масло сливочное Традиционное 82.5% 180г', .18], 'Разрыхлитель': ['Разрыхлитель теста 10г', .01], 'Сливочный сыр': ['Сыр творожный Hochland сливочный 60% 220г', .22],
  'Сливки 33%': ['Сливки для взбивания 33% 500г', .5], 'Сахарная пудра': ['Пудра сахарная 250г', .25], 'Ягоды': ['Клубника замороженная 300г', .3], 'Крахмал': ['Крахмал картофельный 200г', .2],
  'Тёмный шоколад': ['Шоколад горький 72% 100г', .1], 'Лимонный сок': ['Сок лимона 200мл', .2], 'Варёная сгущёнка': ['Молоко сгущённое варёное с сахаром 8,5% 360г', .36],
  'Мёд': ['Мёд натуральный цветочный 500г', .5], 'Сода': ['Сода пищевая 500г', .5], 'Сметана 25%': ['Сметана 25% 300г', .3], 'Молоко': ['Молоко ультрапастеризованное 3,2% 1л', 1.03],
  'Сгущёнка': ['Молоко сгущённое цельное с сахаром 8,5% 380г', .38], 'Чернослив': ['Чернослив без косточки 200г', .2], 'Грецкие орехи': ['Грецкий орех очищенный 150г', .15], 'Вишня': ['Вишня замороженная без косточки 300г', .3] };
const DOM = { '5ka.ru': 'pyat', 'magnit.ru': 'magnit', 'perekrestok.ru': 'perek', 'auchan.ru': 'auchan' };

async function run(mode) {
  const dir = await mkdtemp(join(tmpdir(), 'cake-'));
  await cp(root, dir, { recursive: true, filter: (s) => !s.includes('node_modules') });
  const base = JSON.parse(await readFile(join(dir, 'prices.json'), 'utf8'));
  const { INGREDIENTS } = await import(new URL('../scripts/update-prices.mjs', import.meta.url));
  let calls = 0, keys = new Set();
  const srv = http.createServer((req, res) => {
    calls++; keys.add(req.headers['x-api-key']);
    const u = new URL(req.url, 'http://x');
    const q = u.searchParams.get('query'), chain = DOM[u.searchParams.get('include_domains')];
    const ing = INGREDIENTS.find((i) => i.q.includes(q));
    let results = [];
    if (ing && mode === 'full') {
      const [title, w, kind] = T[ing.name];
      const per = base.data[ing.name]?.[chain]?.[0] ?? 500;       // «рыночная» цена за кг сейчас на 10% выше сохранённой
      const unitPrice = per * 1.10;
      const dens = ing.dens || 1;
      const pack = kind === 'pcs' ? unitPrice * w : unitPrice * w * (w === 1.03 ? 1 : dens);
      results = [0.95, 1.05].map((k, i) => ({ title, url: 'https://' + u.searchParams.get('include_domains') + '/product/p/item' + i + '-' + encodeURIComponent(q), snippet: 'по цене ' + (pack * k).toFixed(2) + ' рублей' }));
    }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ results }));
  });
  await new Promise((r) => srv.listen(0, r));
  const env = { ...process.env, TINYFISH_API_KEY: 'test-key', TINYFISH_API_URL: 'http://127.0.0.1:' + srv.address().port, DELAY_MS: '0' };
  const out = await new Promise((resolve) => {
    import('node:child_process').then(({ spawn }) => {
      const p = spawn('node', [join(dir, 'scripts/update-prices.mjs')], { env });
      let log = ''; p.stdout.on('data', (d) => log += d); p.stderr.on('data', (d) => log += d);
      p.on('close', (code) => resolve({ code, log }));
    });
  });
  srv.close();
  const after = JSON.parse(await readFile(join(dir, 'prices.json'), 'utf8'));
  return { ...out, base, after, calls, keys: [...keys] };
}

const full = await run('full');
assert.equal(full.code, 0, full.log);
assert.deepEqual(full.keys, ['test-key']);
const today = new Date().toISOString().slice(0, 10);
assert.equal(full.after.updatedAt, today);
const m = full.after.data['Мука'].pyat, mb = full.base.data['Мука'].pyat;
assert.ok(Math.abs(m[0] / mb[0] - 1.10) < 0.02, 'мука Пятёрочки: ' + m[0] + ' vs ' + mb[0]);
assert.equal(m[2], today); assert.equal(m[1], 4);   // 2 запроса × 2 результата
const egg = full.after.data['Яйца'].perek;
assert.ok(Math.abs(egg[0] / full.base.data['Яйца'].perek[0] - 1.10) < 0.02);
assert.ok(full.after.data['Лимонный сок'].perek, 'для ячейки без прошлой цены значение должно появиться');
console.log('полный прогон: ок,', full.calls, 'запросов,', full.log.split('\n').find((l) => l.startsWith('Обновлено')));

const empty = await run('empty');
assert.equal(empty.code, 1, 'при пустой выдаче запуск должен падать');
assert.deepEqual(empty.after, empty.base, 'файл не должен меняться');
assert.match(empty.log, /Слишком мало цен/);
console.log('пустая выдача: запуск упал, файл не тронут, ок');
