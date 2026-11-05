// Покадровый рендер Reels «Крем = 55% цены торта» (1080x1920, 30 fps).
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = __dirname + '/frames';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
const FPS = 30;

// target: что показать (функция в странице вернёт абсолютный Y элемента), hl: что подсветить.
const BEATS = [
  { t: 0.0,  target: 'cake',   card: 'КОРЖИ 397 ₽ → ТОРТ 1 422 ₽', sub: 'Коржи: 397 ₽. Весь торт: 1 422 ₽.' },
  { t: 2.6,  target: 'cake',   card: 'ГДЕ ТЫСЯЧА РУБЛЕЙ?',          sub: 'Считаете цену по муке и яйцам? Теряете больше половины.' },
  { t: 5.6,  target: 'sliders',card: '24 СМ · 3 КОРЖА',             sub: 'Смотрите. Бисквит, 24 см, три коржа.', hl: 'sliders' },
  { t: 8.2,  target: 'g0',     card: 'КОРЖИ: 397 ₽',                sub: 'Мука, сахар, яйца, масло: 397 ₽.', hl: 'g0' },
  { t: 10.8, target: 'g2',     card: 'НАЧИНКА: 240 ₽',              sub: 'Ягодная начинка: ещё 240 ₽.', hl: 'g2' },
  { t: 13.2, target: 'g1',     card: 'КРЕМ: 786 ₽',                 sub: 'А теперь крем. Сыр, сливки, пудра: 786 ₽.', hl: 'g1' },
  { t: 16.0, target: 'g1',     card: '55% ЦЕНЫ ТОРТА',              sub: 'Это 55% всего торта.', hl: 'g1', big: true },
  { t: 18.2, target: 'g1',     card: 'СЫР ДОРОЖЕ КОРЖЕЙ',           sub: 'Один только сыр: 564 ₽. Дороже всех коржей.', hl: 'cheese' },
  { t: 20.8, target: 'costChains', card: 'ЦЕНЫ НА 5 НОЯБРЯ',        sub: 'Калькулятор сам добавляет крем, по ценам 4 сетей.', hl: 'costChains' },
  { t: 23.8, target: 'costChains', card: '', sub: 'Бесплатно, ссылка в шапке профиля.', end: true },
  { t: 26.4, target: 'costTop',card: 'СОХРАНИ',                     sub: 'Сохраните и считайте весь торт, а не только коржи.', hl: 'costTop' },
];
const TOTAL = 29.5;
const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 });
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(1500);

  // Оверлеи. Безопасная зона 1080x1920: y 230..1440 px, справа 230 px свободно (в CSS-пикселях /3).
  await p.addStyleTag({ content: `
    html{scroll-behavior:auto!important}
    #ovCard{position:fixed;left:16px;right:80px;top:80px;z-index:50;background:#c8102e;color:#fff;
      font:800 24px/1.15 Manrope,system-ui,sans-serif;padding:12px 16px;border-radius:16px;
      box-shadow:0 4px 0 rgba(0,0,0,.2);letter-spacing:-.01em;transition:none}
    #ovCard.big{font-size:40px;text-align:center}
    #ovSub{position:fixed;left:16px;right:80px;bottom:190px;z-index:50;background:rgba(43,26,20,.9);color:#fff;
      font:700 19px/1.3 Manrope,system-ui,sans-serif;padding:10px 14px;border-radius:14px}
    #ovNote{position:fixed;left:16px;top:458px;z-index:50;color:#8a7468;font:600 11px Manrope,sans-serif;
      background:rgba(251,247,242,.85);padding:2px 8px;border-radius:8px}
    .ovHL{outline:4px solid #c8102e!important;outline-offset:4px;border-radius:12px;background:#fff3c4!important}
    #ovEnd{position:fixed;inset:0;z-index:40;background:#c8102e;color:#fff;display:none;
      flex-direction:column;justify-content:center;align-items:flex-start;padding:0 80px 140px 24px;
      font-family:Manrope,system-ui,sans-serif}
    #ovEnd h2{font-size:40px;line-height:1.05;margin:0 0 14px;font-weight:800}
    #ovEnd p{font-size:18px;margin:0 0 10px;color:#ffe27a;font-weight:700}
    #ovEnd .u{font-size:16px;white-space:nowrap;color:#fff;background:rgba(0,0,0,.18);padding:8px 12px;border-radius:10px}` });
  await p.evaluate(() => {
    for (const [id, html] of [['ovCard', ''], ['ovSub', ''], ['ovNote', 'Цены ориентировочные, 5.11.2026'],
      ['ovEnd', '<h2>Калькулятор торта</h2><p>Себестоимость с кремом и начинкой</p><p>Бесплатно · ссылка в шапке</p><div class="u">cake-calculator.netlify.app</div>']]) {
      const d = document.createElement('div'); d.id = id; d.innerHTML = html; document.body.appendChild(d);
    }
  });
  // Абсолютные Y целей; прокрутка ставит цель на ~190 CSS px от верха (между карточкой и субтитром).
  const Y = await p.evaluate(() => {
    const top = e => e.getBoundingClientRect().top + scrollY;
    const g = [...document.querySelectorAll('#list .group')];
    return { cake: top(document.getElementById('viz')) - 150, sliders: top(document.getElementById('sliders')) - 175,
      g0: top(g[0]) - 175, g1: top(g[1]) - 175, g2: top(g[2]) - 175,
      costChains: top(document.getElementById('costChains')) - 190, costTop: top(document.getElementById('costTop')) - 180 };
  });

  const n = Math.round(TOTAL * FPS);
  let cur = -1;
  for (let f = 0; f < n; f++) {
    const t = f / FPS;
    let i = 0; while (i + 1 < BEATS.length && BEATS[i + 1].t <= t) i++;
    const bt = BEATS[i], prev = BEATS[Math.max(0, i - 1)];
    const k = ease((t - bt.t) / 0.5);
    const y = Y[prev.target] + (Y[bt.target] - Y[prev.target]) * k;
    await p.evaluate(([y, beat, changed]) => {
      window.scrollTo(0, y);
      if (typeof V3 !== 'undefined') { V3.yaw += 0.035; v3req(); }
      if (changed) {
        const c = document.getElementById('ovCard');
        c.textContent = beat.card; c.style.display = beat.card ? 'block' : 'none'; c.classList.toggle('big', !!beat.big);
        document.getElementById('ovSub').textContent = beat.sub;
        document.getElementById('ovEnd').style.display = beat.end ? 'flex' : 'none';
        document.getElementById('ovNote').style.display = beat.end ? 'none' : 'block';
        document.querySelectorAll('.ovHL').forEach(e => e.classList.remove('ovHL'));
        const g = [...document.querySelectorAll('#list .group')];
        const map = { g0: g[0], g1: g[1], g2: g[2], cheese: g[1] && g[1].querySelector('.row'),
          sliders: document.getElementById('sliders'), costChains: document.getElementById('costChains'),
          costTop: document.querySelector('#costTop .top') };
        if (beat.hl && map[beat.hl]) map[beat.hl].classList.add('ovHL');
      }
    }, [y, bt, i !== cur]);
    cur = i;
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
    await p.screenshot({ path: `${OUT}/f${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  await b.close();
  console.log('frames', n);
})();
