import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/.devin/chrome/chrome/linux-156.0.8078.47/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog', '--disable-dev-shm-usage'] });
for (const q of process.argv.slice(2)) {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 })).newPage();
  await page.goto(`http://localhost:5173/?capture&dr=0&time=19&rate=4&depth=0.14&cloud=0.75&aurora=0&${q}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => window.__snow, null, { timeout: 300000 });
  for (let i = 0; i < 2; i++) await page.evaluate(() => window.__snow.step(0.4));
  const t = await page.evaluate(() => { const s = window.__snow, gl = s.renderer.getContext(), r = []; for (let i = 0; i < 4; i++) { const t = performance.now(); s.step(1 / 30); gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); r.push(Math.round(performance.now() - t)); } return r; });
  const t0 = Date.now(); await page.screenshot({ path: '/tmp/x.jpg', type: 'jpeg', quality: 93, timeout: 180000 });
  console.log(q, JSON.stringify(t), 'shot', Date.now() - t0);
  await page.close();
}
await browser.close();
