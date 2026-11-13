// Records one shot of the promo video frame by frame (the page runs in ?capture mode, stepped with a fixed dt).
// Usage: node tools/film.mjs <shot> [stride=1] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const FPS = 30, VW = 432, VH = 768, DSF = +(process.env.DSF || 2.5), PR = +(process.env.PR || 1.875);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const TARGET = [-0.6, 3.3, -1.4];
// camera from azimuth / radius / height around a target
const cam = ({ az, r, y, t = TARGET, fov = 40 }) => ({ p: [t[0] + Math.sin(az) * r, y, t[2] + Math.cos(az) * r], t, fov });
const CHEAP = 'msaa=0&shadow=1024';

const SHOTS = {
  hook: {
    frames: 105, ui: 'none',
    query: `preset=aurora&pause&rate=0.5&${CHEAP}`,
    cam: (u) => cam({ az: lerp(0.52, 0.44, u), r: lerp(25, 21.5, ease(u)), y: 2.5, t: [-0.6, 5.6, -1.4], fov: 46 }),
  },
  curve: {
    frames: 195, ui: 'panel', shiftY: 0.2,
    query: `pause&time=19&rate=0&depth=0.14&temp=-6&wind=2&cloud=0.75&haze=0.12&aurora=0&gust=0.2&${CHEAP}`,
    cam: (u) => cam({ az: 0.56, r: lerp(20.5, 19, u), y: 2.4, fov: 40 }),
    // drag three nodes of the snowfall curve up: [node, value, startFrame, endFrame]
    drags: [[19, 7.2, 22, 52], [20, 6.0, 66, 90], [18, 5.2, 104, 126]],
  },
  pile: {
    frames: 150, ui: 'hud',
    query: `time=20&rate=5.5&depth=0&temp=-6&wind=2.5&cloud=0.8&haze=0.22&aurora=0&gust=0.2&${CHEAP}`,
    state: { dayLength: 10, playing: true },
    cam: (u) => cam({ az: lerp(0.8, 0.66, u), r: 15.5, y: 2.3, t: [0.6, 2.5, 0], fov: 40 }),
  },
  sky: {
    frames: 180, ui: 'hud',
    query: 'time=12.6&rate=0&depth=0.55&temp=-8&wind=1.5&cloud=0.3&haze=0.03&aurora=1&gust=0.15&msaa=4&shadow=2048',
    state: { dayLength: 13.1, playing: true },
    cam: (u) => cam({ az: lerp(1.05, 0.35, ease(u)), r: 20, y: 2.35, t: [-0.6, 4.2, -1.4], fov: 44 }),
  },
  storm: {
    frames: 90, ui: 'hud',
    query: `preset=blizzard&pause&${CHEAP}`,
    cam: (u) => cam({ az: lerp(0.5, 0.4, u), r: lerp(17.5, 16.5, u), y: 2.3, t: [0.2, 3.3, -0.8], fov: 40 }),
  },
  end: {
    frames: 105, ui: 'none',
    query: `preset=light&pause&depth=0.4&${CHEAP}`,
    cam: (u) => cam({ az: lerp(0.3, 0.38, u), r: lerp(17, 19.5, ease(u)), y: 2.3, t: [0.4, 3.6, -0.4], fov: 42 }),
  },
};

const [name, strideArg = '1', outArg] = process.argv.slice(2);
const shot = SHOTS[name]; if (!shot) throw new Error('unknown shot ' + name);
const stride = +strideArg, dt = stride / FPS;
const out = outArg || `/home/ubuntu/work/video/${stride > 1 ? 'preview' : 'frames'}/${name}`;
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/.devin/chrome/chrome/linux-156.0.8078.47/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog', '--disable-dev-shm-usage'],
});
const page = await (await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF })).newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => logs.push('PAGEERR ' + e.message));
await page.goto(`http://localhost:5173/?capture&dr=0&q=medium&pr=${PR}&${shot.query}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => window.__snow, null, { timeout: 300000 });

await page.addStyleTag({ content: `
  #tip { display: none !important; } * { transition: none !important; }
  body.film-none .ui { display: none !important; }
  body.film-hud #panel, body.film-hud #topbar { display: none !important; }
  body.film-hud #hud { left: 20px; right: auto; bottom: 25.5vh; transform: scale(.9); transform-origin: left bottom; }
  #touch { position: fixed; left: 0; top: 0; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; z-index: 99; pointer-events: none;
    background: rgba(255,255,255,.28); border: 2px solid rgba(255,255,255,.85); box-shadow: 0 2px 14px rgba(0,0,0,.45); opacity: 0; }
  #touch.down { background: rgba(255,255,255,.5); }
` });
await page.evaluate(({ ui, state, shiftY }) => {
  const s = window.__snow;
  document.body.classList.add('film-' + ui);
  Object.assign(s.state, { autoCam: false }, state || {});
  Object.assign(s.controls, { enableDamping: false, autoRotate: false, minDistance: 1, maxDistance: 90, minPolarAngle: 0.2, maxPolarAngle: 1.75, minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity });
  const t = document.createElement('div'); t.id = 'touch'; document.body.appendChild(t);
  if (ui === 'panel') { const p = document.getElementById('panel'); p.scrollTop = p.querySelector('.card').offsetTop - 10; }
  if (shiftY) s.camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * shiftY, innerWidth, innerHeight);
}, { ui: shot.ui, state: shot.state, shiftY: shot.shiftY || 0 });

// geometry of the curve editor, for the drags
let geo = null;
if (shot.drags) geo = await page.evaluate((nodes) => {
  const c = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const texts = [...document.querySelectorAll('#curve text')];
  const y0 = c(texts.find((t) => t.textContent === '0'))[1], y8 = c(texts.find((t) => t.textContent === '8'))[1];
  const hits = [...document.querySelectorAll('#curve .hit')];
  return { per: (y0 - y8) / 8, pos: Object.fromEntries(nodes.map((n) => [n, c(hits[n])])) };
}, shot.drags.map((d) => d[0]));

const setCam = (c) => page.evaluate((c) => {
  const s = window.__snow; s.controls.target.set(...c.t); s.camera.position.set(...c.p); s.camera.fov = c.fov; s.camera.updateProjectionMatrix();
}, c);
const touch = (x, y, opacity, down) => page.evaluate(([x, y, o, d]) => {
  const t = document.getElementById('touch'); t.style.transform = `translate(${x}px, ${y}px) scale(${d ? 0.82 : 1})`; t.style.opacity = o; t.classList.toggle('down', d);
}, [x, y, opacity, down]);

// touch pointer path: glide to a node, press, drag up, release, move on
let pressed = false, cur = geo ? [VW * 0.5, VH * 0.93] : null;
async function pointer(f) {
  if (!shot.drags) return;
  let op = 0, pos = cur, down = false;
  for (let k = 0; k < shot.drags.length; k++) {
    const [n, v, a, b] = shot.drags[k], [nx, ny] = geo.pos[n];
    const prevEnd = k ? shot.drags[k - 1][3] : 0, nextStart = k + 1 < shot.drags.length ? shot.drags[k + 1][2] : Infinity;
    const from = k ? [geo.pos[shot.drags[k - 1][0]][0], geo.pos[shot.drags[k - 1][0]][1] - shot.drags[k - 1][1] * geo.per] : [VW * 0.5, VH * 0.93];
    if (f >= prevEnd && f < a) { const u = ease((f - prevEnd) / Math.max(1, a - 4 - prevEnd)); pos = [lerp(from[0], nx, u), lerp(from[1], ny, u)]; op = k ? 1 : ease((f - prevEnd) / 10); }
    else if (f >= a && f <= b) { const u = ease((f - a) / (b - a)); pos = [nx, ny - v * geo.per * u]; op = 1; down = true; }
    else if (f > b && f < nextStart && k === shot.drags.length - 1) { pos = [nx, ny - v * geo.per]; op = 1 - ease((f - b - 6) / 14); }
  }
  if (down && !pressed) { await page.mouse.move(pos[0], geo.pos[shot.drags.find((d) => f >= d[2] && f <= d[3])[0]][1]); await page.mouse.down(); pressed = true; }
  if (!down && pressed) { await page.mouse.up(); pressed = false; }
  await page.mouse.move(pos[0], pos[1]);
  cur = pos; await touch(pos[0], pos[1], op, down);
}

await setCam(shot.cam(0));
for (let i = 0; i < 3; i++) await page.evaluate(() => window.__snow.step(0.4)); // settle
const t0 = Date.now();
for (let f = 0; f < shot.frames; f += stride) {
  await setCam(shot.cam(f / (shot.frames - 1)));
  await pointer(f);
  await page.evaluate((dt) => window.__snow.step(dt), dt);
  await page.screenshot({ path: `${out}/f${String(f / stride).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 93, timeout: 120000 });
  if ((f / stride) % 15 === 0) console.log(name, f, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (process.env.DEBUG) console.log(f, JSON.stringify(cur), pressed, JSON.stringify(await page.evaluate(() => [window.__snow.state.curve.slice(17, 22), document.getElementById('curveTime').textContent, document.elementFromPoint(...(window.__lastPt || [0, 0]))?.className?.baseVal])));
}
const st = await page.evaluate(() => { const s = window.__snow.state; return { time: +s.time.toFixed(2), depth: +s.depth.toFixed(3), curve: s.curve.slice(17, 22) }; });
console.log(name, 'done', `${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(st), JSON.stringify([...new Set(logs)]));
await browser.close();
