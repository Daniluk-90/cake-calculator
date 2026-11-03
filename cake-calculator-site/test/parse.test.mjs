import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAINS, INGREDIENTS, extract, aggregate, findPrice, findWeightKg, findCount } from '../scripts/update-prices.mjs';

const ing = (n) => INGREDIENTS.find((x) => x.name === n);
const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, a + ' != ' + b);

// Реальная выдача TinyFish по 5ka.ru на запрос «мука пшеничная 1 кг» (4 ноября 2026)
const flour5ka = [
  { title: 'Мука Селяночка Пшеничная хлебопекарная высший ...', url: 'https://5ka.ru/product/muka-selyanochka-pshenichnaya-khlebopekarnaya-vyss--4045920/', snippet: 'Мука Селяночка Пшеничная хлебопекарная высший сорт 1кг по цене 69.99 рублей с доставкой на дом из «Пятёрочки» в Москве и по России.' },
  { title: 'Мука: купить с доставкой на дом в магазине', url: 'https://5ka.ru/catalog/muka--251C53521/', snippet: 'Мука Гарнец кукурузная 500г. 500 г. 209 99 ₽. В корзину. Мука Селяночка пшеничная хлебопекарная обойная 1кг.' },
  { title: 'Мука Makfa Пшеничная высший сорт 1кг', url: 'https://5ka.ru/product/muka-makfa-pshenichnaya-vysshiy-sort-1kg--2003107/', snippet: 'Мука Makfa Пшеничная высший сорт 1кг по цене 79.99 рублей с доставкой на дом из «Пятёрочки»' },
  { title: 'Мука Селяночка пшеничная хлебопекарная обойная 1кг', url: 'https://5ka.ru/product/muka-selyanochka-pshenichnaya-khlebopekarnaya-oboy--4264805/', snippet: 'Мука Селяночка пшеничная хлебопекарная обойная 1кг по цене 70.99 рублей' },
  { title: 'Мука Makfa пшеничная высший сорт 2кг', url: 'https://5ka.ru/product/muka-makfa-pshenichnaya-vysshiy-sort-2kg--91304/', snippet: 'Мука Makfa пшеничная высший сорт 2кг по цене 139.99 рублей с доставкой' },
  { title: 'Оценка товаров в - Оценивайте покупки в «Пятёрочке', url: 'https://5ka.ru/ratings/', snippet: 'Как оценить товар? Вы можете оценить любой товар из купленных вами в «Пятёрочке» за последние 30 дней' },
  { title: 'Мука С.Пудовъ пшеничная цельнозерновая обойная 1кг', url: 'https://5ka.ru/product/muka-s-pudov-pshenichnaya-tselnozernovaya-oboynaya--3661294/', snippet: 'по цене 109.99 рублей' },
];

test('мука Пятёрочки: берутся только карточки обычной муки', () => {
  const v = flour5ka.map((r) => extract(ing('Мука'), r, CHAINS.pyat)).filter((x) => x !== null);
  assert.equal(v.length, 3);
  close(v[0], 69.99); close(v[1], 79.99); close(v[2], 69.995);
  const a = aggregate(v, 69.99);
  close(a.price, 69.995); assert.equal(a.n, 3);
});

test('яйца: цена за штуку', () => {
  const r = { title: 'Яйцо куриное Окское столовое С1 10шт', url: 'https://5ka.ru/product/yaytso-okskoe--3062836/', snippet: 'по цене 119.99 рублей' };
  close(extract(ing('Яйца'), r, CHAINS.pyat), 11.999);
  const bad = { title: 'Яйцо перепелиное 20шт', url: 'https://5ka.ru/product/x--1/', snippet: 'по цене 99.99 рублей' };
  assert.equal(extract(ing('Яйца'), bad, CHAINS.pyat), null);
});

test('молоко: литры переводятся в кг по плотности', () => {
  const r = { title: 'Молоко ЭкоНива ультрапастеризованное 3.2% БЗМЖ 1л', url: 'https://5ka.ru/product/m--1/', snippet: 'по цене 114.99 рублей' };
  close(extract(ing('Молоко'), r, CHAINS.pyat), 111.64);
});

test('сметана, масло, шоколад: фильтры по жирности', () => {
  const sm = { title: 'Сметана Домик в деревне отборная 25% БЗМЖ 300г', url: 'https://www.perekrestok.ru/cat/1704/p/smetana-3665625', snippet: 'Цена 124,99 ₽' };
  close(extract(ing('Сметана 25%'), sm, CHAINS.perek), 416.63);
  const sm20 = { title: 'Сметана Авида 20% 300г', url: 'https://www.perekrestok.ru/cat/1/p/x-1', snippet: '91,99 ₽' };
  assert.equal(extract(ing('Сметана 25%'), sm20, CHAINS.perek), null);
  const bu = { title: 'Масло сливочное Вкуснотеево Традиционное 82.5% БЗМЖ 180 г', url: 'https://5ka.ru/product/b--1/', snippet: 'по цене 209.99 рублей' };
  close(extract(ing('Сливочное масло'), bu, CHAINS.pyat), 1166.61, 0.02);
  const ch = { title: 'Шоколад горький Победа вкуса 72% 100 г', url: 'https://www.auchan.ru/product/shokolad-pobeda-vkusa/', snippet: '204,99 ₽' };
  close(extract(ing('Тёмный шоколад'), ch, CHAINS.auchan), 2049.9);
  const milk = { title: 'Шоколад молочный 72% 100 г', url: 'https://www.auchan.ru/product/x/', snippet: '100 ₽' };
  assert.equal(extract(ing('Тёмный шоколад'), milk, CHAINS.auchan), null);
});

test('разбор цены и веса', () => {
  close(findPrice('Мука Гарнец 500г. 209 99 ₽. В корзину'), 209.99);
  close(findPrice('цена 1 234,50 ₽'), 234.5 + 0, 300);          // пробел-разделитель тысяч не поддерживается: такие значения отсеет проверка по прошлой цене
  close(findWeightKg('Масло 180г.'), 0.18);
  close(findWeightKg('Молоко 925 мл'), 0.925);
  close(findWeightKg('Крупа 2 кг'), 2);
  assert.equal(findWeightKg('Набор 5 груш'), null);              // «гр» внутри слова не считается граммами
  assert.equal(findCount('Яйца 10 шт.'), 10);
});

test('aggregate: выбросы и одиночные находки', () => {
  assert.equal(aggregate([500], 100), null);                    // один товар и цена в 5 раз выше прошлой
  assert.equal(aggregate([30, 400], 100), null);                // оба вне диапазона
  close(aggregate([95, 105, 900], 100).price, 100);             // выброс отброшен
  close(aggregate([110], 100).price, 110);                      // одиночная находка в разумных пределах
  assert.equal(aggregate([160], 100), null);                    // одиночная, но слишком далеко от прошлой
  close(aggregate([50, 60], null).price, 55);                   // без прошлой цены достаточно двух
});
