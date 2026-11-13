// Usage: node tools/cover.mjs <out.png> <cssW> <cssH> <dsf> "<query>"   — one high-quality still of the real page for the video cover
import { chromium } from 'playwright-core';
const [out, w, h, dsf, query] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/.devin/chrome/chrome/linux-156.0.8078.47/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog', '--disable-dev-shm-usage'],
});
const page = await (await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dsf })).newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => logs.push('PAGEERR ' + e.message));
await page.goto(`http://localhost:5173/?capture&dr=0&${query}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => window.__snow, null, { timeout: 300000 });
const C = (process.env.CURVE || '0.3,0.4,0.6,1.0,1.6,2.2,2.0,1.4,0.9,0.6,0.5,0.8,1.6,2.8,4.2,5.6,6.6,6.9,6.0,4.4,2.8,1.5,0.6,0.4,0.3').split(',').map(Number);
const svg = await page.evaluate(() => { const r = document.getElementById('curve').getBoundingClientRect(); return document.body.classList.contains('hide-ui') ? null : [r.x, r.y, r.width, r.height]; });
if (svg) {
  // shape the curve the way a user does: drag every node with the mouse
  const node = (i, v) => [svg[0] + ((26 + (306 * i) / 24) / 340) * svg[2], svg[1] + ((146 - (134 * v) / 8) / 170) * svg[3]];
  for (let i = 0; i < 25; i++) {
    const cur = await page.evaluate((i) => window.__snow.state.curve[i], i);
    await page.mouse.move(...node(i, cur)); await page.mouse.down(); await page.mouse.move(...node(i, C[i]), { steps: 3 }); await page.mouse.up();
  }
  await page.mouse.move(+w - 40, +h * 0.45);
} else await page.evaluate((C) => C.forEach((v, i) => { window.__snow.state.curve[i] = v; }), C);
await page.evaluate(() => { const s = window.__snow; for (let i = 0; i < 8; i++) s.step(0.4); for (let i = 0; i < 4; i++) s.step(1 / 30); });
await page.screenshot({ path: out, timeout: 900000 });
console.log(out, JSON.stringify(await page.evaluate(() => ({ t: window.__snow.state.time, d: window.__snow.state.depth, c: window.__snow.state.curve.slice(18, 24) }))), logs);
await browser.close();
