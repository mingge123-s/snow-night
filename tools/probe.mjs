// node tools/probe.mjs <q> <pr> <w> <h> <dpr> "<extra query>" <out>
import { chromium } from 'playwright-core';
const [q, pr, w, h, dpr, extra = '', out = '/home/ubuntu/work/video/probe.jpg'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/.devin/chrome/chrome/linux-156.0.8078.47/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog', '--disable-dev-shm-usage'],
});
const page = await (await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr })).newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => logs.push('PAGEERR ' + e.message));
let t = Date.now();
await page.goto(`http://localhost:5173/?capture&dr=0&q=${q}&pr=${pr}&${extra}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__snow);
console.log('load', Date.now() - t);
if (process.env.EVAL) await page.evaluate(process.env.EVAL);
for (let i = 0; i < +(process.env.N || 6); i++) {
  t = Date.now();
  await page.evaluate(() => { window.__snow.step(1 / 30); window.__snow.renderer.getContext().finish(); });
  const a = Date.now() - t; t = Date.now();
  await page.screenshot({ path: out, type: 'jpeg', quality: 95 });
  console.log('step', a, 'shot', Date.now() - t);
}
console.log(JSON.stringify(logs));
await browser.close();
