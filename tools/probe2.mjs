import { chromium } from 'playwright-core';
const [q, pr, extra = ''] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/.devin/chrome/chrome/linux-156.0.8078.47/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog', '--disable-dev-shm-usage'],
});
const page = await (await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 })).newPage();
await page.goto(`http://localhost:5173/?capture&dr=0&q=${q}&pr=${pr}&${extra}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__snow);
const r = await page.evaluate(async () => {
  const s = window.__snow, gl = s.renderer.getContext(), px = new Uint8Array(4), out = [];
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  for (let i = 0; i < 4; i++) {
    const t = performance.now(); s.step(1 / 30); sync(); const a = performance.now() - t;
    const t2 = performance.now(); const c = document.getElementById('view'); const d = c.toDataURL('image/jpeg', 0.95); out.push([Math.round(a), Math.round(performance.now() - t2), d.length, c.width, c.height]);
  }
  // per-part cost
  const parts = {};
  const time = (name, fn) => { fn(); sync(); const t = performance.now(); s.step(1 / 30); sync(); parts[name] = Math.round(performance.now() - t); };
  time('base', () => {});
  time('noShadow', () => { s.renderer.shadowMap.autoUpdate = false; });
  s.renderer.shadowMap.autoUpdate = true;
  const hidden = [];
  s.scene.traverse((o) => { if (o.isInstancedMesh && o.count > 20) hidden.push(o); });
  time('noInstanced', () => hidden.forEach((o) => (o.visible = false)));
  hidden.forEach((o) => (o.visible = true));
  const pts = []; s.scene.traverse((o) => { if (o.isPoints) pts.push(o); });
  time('noPoints', () => pts.forEach((o) => (o.visible = false)));
  return { out, parts, inst: hidden.map((o) => [o.count, o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3]), pts: pts.length };
});
console.log(JSON.stringify(r));
await browser.close();
