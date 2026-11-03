// Сборщик цен для калькулятора торта. Node 20+, без зависимостей.
// Запуск: TINYFISH_API_KEY=... node scripts/update-prices.mjs
// Берёт страницы товаров четырёх сетей через бесплатный TinyFish Search API,
// считает цену за кг (яйца: за штуку) и обновляет prices.json.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const API = process.env.TINYFISH_API_URL || 'https://api.search.tinyfish.ai';
const PRICES_FILE = new URL('../prices.json', import.meta.url);
const DELAY_MS = Number(process.env.DELAY_MS ?? 2200);            // лимит бесплатного поиска: 30 запросов в минуту
const MIN_UPDATED_SHARE = 0.25;   // если обновилось меньше четверти цен, запуск считается неудачным

export const CHAINS = {
  pyat:   { name: 'Пятёрочка',  domain: '5ka.ru',         product: /\/product\// },
  magnit: { name: 'Магнит',     domain: 'magnit.ru',      product: /\/product\// },
  perek:  { name: 'Перекрёсток', domain: 'perekrestok.ru', product: /\/p\// },
  auchan: { name: 'Ашан',       domain: 'auchan.ru',      product: /\/product\// },
};

// unit 'kg': цена за кг по весу из названия; 'pcs': цена за штуку; dens: плотность для мл и л.
// min/max: допустимый вес упаковки в кг (для pcs: число штук).
export const INGREDIENTS = [
  { name: 'Мука', q: ['мука пшеничная высший сорт 1 кг', 'мука пшеничная хлебопекарная 2 кг'], must: [/мук/, /пшенич/], not: [/кукуруз|ржан|рисов|овсян|миндал|гречнев|обойн|цельнозерн|смесь|блин|кокос|нутов|льнян/], min: 0.9, max: 5 },
  { name: 'Сахар', q: ['сахар-песок белый 1 кг', 'сахар песок'], must: [/сахар/], not: [/пудр|ванил|тростник|коричнев|кусков|рафинад|прессован|заменител|сироп|без сахара|леденц/], min: 0.9, max: 5 },
  { name: 'Яйца', q: ['яйца куриные С1 10 шт', 'яйцо куриное столовое десяток'], must: [/яйц/], not: [/перепел|шоколад|киндер|страус|индюш/], unit: 'pcs', min: 6, max: 30 },
  { name: 'Сливочное масло', q: ['масло сливочное традиционное 82,5% 180 г', 'масло сливочное 82%'], must: [/масло/, /сливочн/, /82/], not: [/растительн|подсолн|топлен|гхи|кокос|шоколад|арахис|ореховое|чеснок|зелен/], min: 0.15, max: 0.5 },
  { name: 'Разрыхлитель', q: ['разрыхлитель теста'], must: [/разрыхлител/], not: [/ванил|набор/], min: 0.005, max: 0.5 },
  { name: 'Сливочный сыр', q: ['сыр творожный сливочный Almette Hochland', 'сыр творожный Violette Cremette для крема'], must: [/сыр/, /(almette|альметте|hochland|хохланд|cremette|креметте|violette|виолетт|philadelphia|филадельфия)/], not: [/плавлен|ветчин|зелен|чеснок|лосос|огурц|перц|травами/], min: 0.12, max: 1.1 },
  { name: 'Сливки 33%', q: ['сливки для взбивания 33%', 'сливки 33% ультрапастеризованные'], must: [/сливк/, /3[3-5]\s*%/], not: [/кофе|сухие|мороженое/], dens: 1, min: 0.2, max: 1.1 },
  { name: 'Сахарная пудра', q: ['сахарная пудра 200 г', 'пудра сахарная'], must: [/пудр/, /сахарн/], not: [/ванил|декор|шоколад|цветн/], min: 0.2, max: 1 },
  { name: 'Ягоды', q: ['клубника замороженная 300 г', 'ягодная смесь замороженная'], must: [/(клубник|ягод|малин|смородин|ассорти)/, /заморож|быстрозамороженн/], not: [/овощ|вишн|мексикан|для компота/], min: 0.25, max: 1 },
  { name: 'Крахмал', q: ['крахмал картофельный', 'крахмал кукурузный'], must: [/крахмал/], not: [/кисель|модифицирован/], min: 0.1, max: 0.5 },
  { name: 'Тёмный шоколад', q: ['шоколад горький 72%', 'шоколад тёмный 70%'], must: [/шоколад/, /(горьк|тёмн|темн)/, /(7\d|8[0-5])\s*%/], not: [/пористый|миндал|апельсин|фундук|набор|конфет|батончик|напиток|паста|молочн|клюкв|вишн|мята|имбир/], min: 0.07, max: 0.2 },
  { name: 'Лимонный сок', q: ['сок лимона 200 мл', 'сок лимонный натуральный'], must: [/сок/, /лимон/], not: [/лимонад|напиток|нектар|мят|концентрат|сироп|апельсин/], dens: 1, min: 0.1, max: 1 },
  { name: 'Варёная сгущёнка', q: ['молоко сгущённое варёное с сахаром 8,5%', 'сгущенка варёная'], must: [/сгущ/, /(варён|вареное|варен)/], not: [/молокосодерж|растительн|заменител|со вкусом|кофе/], min: 0.3, max: 0.5 },
  { name: 'Мёд', q: ['мёд натуральный цветочный 500 г', 'мёд липовый гречишный'], must: [/(мёд|мед)(?![а-яё])/], not: [/медовик|медов|напиток|орех|сот|крем|пряник|печенье|лимонад|сироп|мята|мяты|горчиц|с имбир/], min: 0.25, max: 1.1 },
  { name: 'Сода', q: ['сода пищевая 500 г'], must: [/сода/, /пищев/], not: [/газирован|напиток|кальцинирован/], min: 0.4, max: 0.6 },
  { name: 'Сметана 25%', q: ['сметана 25% 300 г', 'сметана 25% 400 г'], must: [/сметан/, /25\s*%/], not: [/соус|продукт сметан/], min: 0.2, max: 0.6 },
  { name: 'Молоко', q: ['молоко ультрапастеризованное 3,2% 1 л', 'молоко пастеризованное 3,2%'], must: [/молоко/, /3[.,]2/], not: [/сгущ|сух|козье|овсян|миндал|безлактоз|шоколад|ореховое|коктейль|топлен/], dens: 1.03, min: 0.85, max: 1.6 },
  { name: 'Сгущёнка', q: ['молоко сгущённое цельное с сахаром 8,5%', 'сгущенка 380 г'], must: [/сгущ/], not: [/варён|вареное|варен|молокосодерж|кофе|какао|стерилизован|растительн|заменител/], min: 0.25, max: 0.5 },
  { name: 'Чернослив', q: ['чернослив без косточки', 'чернослив сушёный'], must: [/чернослив/], not: [/шоколад|конфет|в глазур|с миндал/], min: 0.15, max: 0.55 },
  { name: 'Грецкие орехи', q: ['грецкий орех очищенный', 'ядра грецкого ореха'], must: [/грецк/, /(очищ|ядр|орех)/], not: [/в шоколаде|конфет|масло|паста|в меду|мёд/], min: 0.1, max: 0.55 },
  { name: 'Вишня', q: ['вишня замороженная без косточки', 'вишня быстрозамороженная'], must: [/вишн/, /заморож/], not: [/смесь|овощ|компот/], min: 0.25, max: 0.7 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (s) => parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
const round2 = (x) => Math.round(x * 100) / 100;
export const median = (a) => { const v = [...a].sort((x, y) => x - y), m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

const UNIT_KG = { 'кг': 1, 'килограмм': 1, 'г': 0.001, 'гр': 0.001, 'грамм': 0.001, 'л': 1, 'мл': 0.001 };
export function findWeightKg(text) {
  const re = /(\d+(?:[.,]\d+)?)\s*(килограмм|грамм|кг|гр|мл|л|г)(?![а-яёa-z])/gi;
  const m = re.exec(text);
  return m ? num(m[1]) * UNIT_KG[m[2].toLowerCase()] : null;
}
export function findCount(text) {
  const m = /(\d+)\s*(?:шт|штук)(?![а-яёa-z])/i.exec(text);
  if (m) return parseInt(m[1], 10);
  return /десяток/i.test(text) ? 10 : null;
}
export function findPrice(text) {
  let m = /по цене\s*(\d+(?:[.,]\d+)?)\s*(?:руб|₽|р(?![а-яё]))/i.exec(text);
  if (m) return num(m[1]);
  m = /(\d{2,4})\s(\d{2})\s*₽/.exec(text);          // формат «209 99 ₽»
  if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / 100;
  m = /(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:₽|руб)/i.exec(text);
  return m ? num(m[1]) : null;
}

// Одна поисковая выдача -> значение цены за кг (или за штуку) либо null
export function extract(ing, r, chain) {
  if (!r || !chain.product.test(r.url || '')) return null;      // только карточки товаров
  const title = (r.title || '').toLowerCase().replace(/ё/g, 'ё');
  const text = title + ' ' + (r.snippet || '').toLowerCase();
  if (!ing.must.every((re) => re.test(title))) return null;
  if (ing.not && ing.not.some((re) => re.test(title))) return null;
  const price = findPrice(text);
  if (!price || price <= 0) return null;
  if (ing.unit === 'pcs') {
    const n = findCount(title) ?? findCount(text);
    if (!n || n < ing.min || n > ing.max) return null;
    return price / n;
  }
  const w = findWeightKg(title) ?? findWeightKg(text);
  if (!w || w < ing.min || w > ing.max) return null;
  return price / (w * (ing.dens || 1));
}

// Значения -> новая цена. base: прошлая цена, для защиты от выбросов.
export function aggregate(values, base) {
  const ok = base ? values.filter((v) => v >= base * 0.5 && v <= base * 2) : values;
  if (ok.length >= 2 || (ok.length === 1 && (!base || (ok[0] >= base * 0.7 && ok[0] <= base * 1.4)))) {
    return { price: round2(median(ok)), n: ok.length };
  }
  return null;
}

async function search(query, domain, key) {
  const url = new URL(API);
  url.searchParams.set('query', query);
  url.searchParams.set('include_domains', domain);
  url.searchParams.set('location', 'RU');
  url.searchParams.set('language', 'ru');
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { 'X-API-Key': key } });
    if (res.status === 401 || res.status === 403) throw new Error('TinyFish отклонил ключ (HTTP ' + res.status + '). Проверьте секрет TINYFISH_API_KEY.');
    if (res.status === 429) { await sleep(15000 * attempt); continue; }
    if (!res.ok) { console.warn('  поиск вернул HTTP ' + res.status + ' для «' + query + '»'); return []; }
    return (await res.json()).results || [];
  }
  return [];
}

export async function main() {
  const key = process.env.TINYFISH_API_KEY;
  if (!key) throw new Error('Не задан TINYFISH_API_KEY');
  const file = JSON.parse(await readFile(PRICES_FILE, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  let cells = 0, updated = 0;
  for (const [id, chain] of Object.entries(CHAINS)) {
    console.log('== ' + chain.name);
    for (const ing of INGREDIENTS) {
      cells++;
      const seen = new Set(), values = [];
      for (const q of ing.q) {
        const results = await search(q, chain.domain, key);
        await sleep(DELAY_MS);
        for (const r of results) {
          if (seen.has(r.url)) continue;
          seen.add(r.url);
          const v = extract(ing, r, chain);
          if (v !== null && isFinite(v)) values.push(v);
        }
      }
      const prev = file.data[ing.name]?.[id];
      const agg = aggregate(values, prev?.[0]);
      if (agg) {
        (file.data[ing.name] ||= {})[id] = [agg.price, agg.n, today];
        updated++;
        console.log('  ' + ing.name + ': ' + agg.price + ' (товаров: ' + agg.n + ')' + (prev ? ', было ' + prev[0] : ''));
      } else {
        console.log('  ' + ing.name + ': не обновлено' + (prev ? ' (остаётся ' + prev[0] + ' от ' + (prev[2] || '?') + ')' : ''));
      }
    }
  }
  console.log('Обновлено ' + updated + ' из ' + cells);
  if (updated < cells * MIN_UPDATED_SHARE) throw new Error('Слишком мало цен обновилось (' + updated + ' из ' + cells + '), файл не изменён.');
  file.updatedAt = today;
  await writeFile(PRICES_FILE, JSON.stringify(file, null, 1) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
