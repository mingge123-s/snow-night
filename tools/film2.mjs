// Records one segment of the landscape (16:9) promo: the real page UI, driven by real mouse events, frame by frame
// (the page runs in ?capture mode and is stepped with a fixed dt).
// Usage: node tools/film2.mjs <segment> [stride=1] [outDir]     env: PR, FROM, TO (frame range), DEBUG
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const FPS = 30, VW = 1280, VH = 720, DSF = 1.5, PR = +(process.env.PR || 1.25);
const ease = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const Q = process.env.Q || 'msaa=0&shadow=1024';
const AZ0 = 0.56, AZ_PER_FRAME = +(process.env.AZR || 1.15e-4); // the page's own slow auto camera, kept continuous across segments

// pointer path builder: keyframes [frame, x, y, buttonDownFromHere]
class Path {
  constructor(start) { this.k = [[0, start[0], start[1], false]]; }
  get last() { const l = this.k[this.k.length - 1]; return [l[1], l[2]]; }
  stay(f) { this.k.push([f, ...this.last, false]); return this; }
  to(f, p, travel = 20) { this.stay(f - travel); this.k.push([f, p[0], p[1], false]); return this; }
  click(f, p, travel = 20) { this.to(f, p, travel); this.k.push([f + 2, p[0], p[1], true], [f + 6, p[0], p[1], false]); return this; }
  drag(f0, f1, p0, p1, travel = 20) {
    this.to(f0, p0, travel); this.k.push([f0 + 3, p0[0], p0[1], true], [f1, p1[0], p1[1], true], [f1 + 4, p1[0], p1[1], false]); return this;
  }
  at(f) {
    const k = this.k; let i = 0;
    while (i + 1 < k.length && k[i + 1][0] <= f) i++;
    const a = k[i], b = k[i + 1];
    if (!b) return { pos: [a[1], a[2]], down: a[3] };
    const u = ease((f - a[0]) / Math.max(1, b[0] - a[0]));
    return { pos: [lerp(a[1], b[1], u), lerp(a[2], b[2], u)], down: a[3] };
  }
}

// each segment: frames, url query, optional state overrides, and the pointer script (g = page geometry helpers)
const SEGS = {
  intro: {
    frames: 90, query: 'preset=aurora',
    path: (g, p) => p.to(62, g.node(19, 0), 42),
  },
  curve: {
    frames: 210, query: 'time=19&rate=0&depth=0.14&temp=-6&wind=2&cloud=0.75&haze=0.12&aurora=0&gust=0.2',
    path: (g, p) => p
      .drag(15, 45, g.node(19, 0), g.node(19, 7.2), 10)
      .drag(64, 88, g.node(20, 0), g.node(20, 6.2), 14)
      .drag(106, 128, g.node(18, 0), g.node(18, 5.0), 14)
      .drag(146, 166, g.node(21, 0), g.node(21, 3.6), 14)
      .to(202, g.btn('#btnClear'), 28),
  },
  pile: {
    frames: 165, query: 'preset=heavy', state: { dayLength: 8 },
    path: (g, p) => p.click(12, g.btn('#btnClear'), 8).to(58, g.offPanel, 30),
  },
  sliders: {
    frames: 225, query: 'time=20.5&rate=4&depth=0.15&temp=-6&wind=2&cloud=0.7&haze=0.1&aurora=0&gust=0.2',
    // the climate card is below the fold at this window size: scroll the panel with the mouse wheel, then back
    scroll: [[14, 34, 0, 1], [200, 218, 1, 0]],
    path: (g, p) => p
      .to(12, g.panelMid, 12)
      .drag(46, 82, g.down(g.slider('depth', 0.15)), g.down(g.slider('depth', 0.7)), 12)
      .drag(106, 140, g.down(g.slider('wind', 2)), g.down(g.slider('wind', 16)), 18)
      .drag(164, 196, g.down(g.slider('haze', 0.1)), g.down(g.slider('haze', 0.6)), 18)
      .to(222, g.time(9.5), 20),
  },
  sky: {
    frames: 180, query: 'preset=clear&aurora=1&cloud=0.25',
    path: (g, p) => p.drag(14, 150, g.time(9.5), g.time(23.2), 10).to(178, g.preset('暴风雪'), 22),
  },
  end: {
    frames: 195, query: 'preset=aurora&time=23.2&cloud=0.25',
    path: (g, p) => p.click(10, g.preset('暴风雪'), 6).click(96, g.preset('小雪静夜'), 22).to(140, g.offPanel, 30),
  },
};
const ORDER = ['intro', 'curve', 'pile', 'sliders', 'sky', 'end'];

const [name, strideArg = '1', outArg] = process.argv.slice(2);
const seg = SEGS[name]; if (!seg) throw new Error('unknown segment ' + name);
const stride = +strideArg, dt = stride / FPS;
const out = outArg || `/home/ubuntu/work/video2/${stride > 1 ? 'preview' : 'frames'}/${name}`;
fs.mkdirSync(out, { recursive: true });
const framesBefore = ORDER.slice(0, ORDER.indexOf(name)).reduce((s, n) => s + SEGS[n].frames, 0);
const az = AZ0 - framesBefore * AZ_PER_FRAME;

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/.devin/chrome/chrome/linux-156.0.8078.47/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog', '--disable-dev-shm-usage', '--disable-smooth-scrolling'],
});
const page = await (await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF })).newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => logs.push('PAGEERR ' + e.message));
await page.goto(`http://localhost:5173/?capture&dr=0&q=medium&pr=${PR}&az=${az.toFixed(4)}&${seg.query}&${Q}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => window.__snow, null, { timeout: 300000 });

await page.addStyleTag({ content: `
  * { transition: none !important; }
  #cursor { position: fixed; left: 0; top: 0; z-index: 99; pointer-events: none; width: 26px; height: 26px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.55)); }
  #ring { position: fixed; left: 0; top: 0; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; z-index: 98; pointer-events: none;
    border: 2px solid rgba(190,215,255,.95); background: rgba(170,200,255,.18); opacity: 0; }
` });
await page.evaluate((state) => {
  Object.assign(window.__snow.state, state || {});
  document.body.insertAdjacentHTML('beforeend', `<div id="ring"></div>
    <svg id="cursor" viewBox="0 0 26 26"><path d="M3 2 L3 20.5 L7.8 16.2 L11 23.6 L14.2 22.2 L11 15 L17.6 15 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`);
}, seg.state);

// geometry of the real controls
const G = await page.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
  const texts = [...document.querySelectorAll('#curve text')];
  const cy = (el) => { const b = el.getBoundingClientRect(); return b.top + b.height / 2; };
  const hits = [...document.querySelectorAll('#curve .hit')];
  const sliders = {};
  document.querySelectorAll('#sliders .slider').forEach((row) => { const i = row.querySelector('input'); sliders[row.querySelector('label').textContent] = [r(i), +i.min, +i.max]; });
  const presets = {}; document.querySelectorAll('#presets button').forEach((b) => { presets[b.textContent] = r(b); });
  const btns = {}; for (const id of ['#btnClear', '#btnReset', '#btnPlay', '#btnCam', '#btnSound']) btns[id] = r(document.querySelector(id));
  const svg = document.querySelector('#curve').getBoundingClientRect();
  return {
    svg: [svg.left, svg.top, svg.width, svg.height], sliders, presets, btns, time: r(document.querySelector('#time')),
    panel: r(document.querySelector('#panel')), panelScroll: [document.querySelector('#panel').scrollHeight, document.querySelector('#panel').clientHeight],
  };
});
const LABEL = { temp: '气温', wind: '风速', windDir: '风向', gust: '阵风', haze: '雾气', cloud: '云量', aurora: '极光', depth: '积雪厚度' };
const mid = (r) => [r[0] + r[2] / 2, r[1] + r[3] / 2];
const thumb = (r, frac) => [r[0] + 6.5 + (r[2] - 13) * frac, r[1] + r[3] / 2];
const g = {
  // curve node i at value v (svg viewBox 340x170; X0=26 X1=332 Y0=12 Y1=146, max 8 cm/h)
  node: (i, v) => [G.svg[0] + ((26 + (306 * i) / 24) / 340) * G.svg[2], G.svg[1] + ((146 - (134 * v) / 8) / 170) * G.svg[3]],
  slider: (key, v) => { const [r, min, max] = G.sliders[LABEL[key]]; return thumb(r, (v - min) / (max - min)); },
  time: (h) => thumb(G.time, h / 24),
  preset: (n) => mid(G.presets[n]),
  btn: (id) => mid(G.btns[id]),
  offPanel: [G.panel[0] + G.panel[2] + 150, VH * 0.62],
  panelMid: [G.panel[0] + G.panel[2] * 0.55, VH * 0.6],
  down: (p) => [p[0], p[1] - (G.panelScroll[0] - G.panelScroll[1])], // position once the panel is scrolled to its end
};
// the pointer starts each segment where the previous one left it
const START = [VW * 0.62, VH * 0.8];
const paths = {}; let startAt = START;
for (const n of ORDER) { paths[n] = SEGS[n].path(g, new Path(startAt)); startAt = paths[n].at(SEGS[n].frames).pos; }
const path = paths[name];
if (process.env.DEBUG) console.log(JSON.stringify(G), JSON.stringify(path.k));

let pressed = false, lastUp = -99;
async function pointer(f) {
  const { pos, down } = path.at(f);
  if (down && !pressed) { await page.mouse.move(pos[0], pos[1]); await page.mouse.down(); pressed = true; }
  if (!down && pressed) { await page.mouse.up(); pressed = false; lastUp = f; }
  await page.mouse.move(pos[0], pos[1]);
  for (const [a, b, s0, s1] of seg.scroll || []) if (f >= a && f <= b) {
    const want = Math.round(lerp(s0, s1, ease((f - a) / (b - a))) * (G.panelScroll[0] - G.panelScroll[1]));
    const cur = await page.evaluate(() => document.getElementById('panel').scrollTop);
    if (want !== cur) await page.mouse.wheel(0, want - cur);
  }
  const fade = pressed ? 1 : Math.max(0, 1 - (f - lastUp) / 9), grow = pressed ? 1 : 1 + (f - lastUp) / 14;
  await page.evaluate(([x, y, o, s, d]) => {
    document.getElementById('cursor').style.transform = `translate(${x - 3}px, ${y - 2}px) scale(${d ? 0.9 : 1})`;
    const r = document.getElementById('ring'); r.style.transform = `translate(${x}px, ${y}px) scale(${s})`; r.style.opacity = o;
  }, [pos[0], pos[1], fade, grow, pressed]);
}

const from = +(process.env.FROM || 0), to = +(process.env.TO || seg.frames);
await pointer(0);
for (let i = 0; i < 3; i++) await page.evaluate(() => { const s = window.__snow, p = s.state.playing; s.state.playing = false; s.step(0.4); s.state.playing = p; }); // settle without advancing the clock
const az0 = await page.evaluate(() => window.__snow.controls.getAzimuthalAngle());
const t0 = Date.now();
let shot = 0;
for (let f = 0; f < to; f++) {
  await pointer(f); // real mouse events on every frame, also in stride previews
  if (f % stride) continue;
  await page.evaluate((dt) => window.__snow.step(dt), dt);
  if (f < from) continue;
  await page.screenshot({ path: `${out}/f${String(f / stride).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 93, timeout: 180000 });
  if (shot++ % 15 === 0) console.log(name, f, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
const st = await page.evaluate(() => { const s = window.__snow; return { time: +s.state.time.toFixed(2), depth: +s.state.depth.toFixed(3), wind: s.state.wind, haze: s.state.haze, curve: s.state.curve.slice(17, 23), az: +s.controls.getAzimuthalAngle().toFixed(4) }; });
console.log(name, 'az', az0.toFixed(4));
console.log(name, 'done', `${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(st), JSON.stringify([...new Set(logs)]));
await browser.close();
