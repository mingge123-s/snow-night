// Usage: node tools/shot.mjs <out.png> "<query>" [waitMs] [width] [height]
import { chromium } from 'playwright-core';
const [out, query = '', wait = '6000', w = '1280', h = '720'] = process.argv.slice(2);
// own headless Chrome (software GL): keeps heavy frames away from the desktop browser's GPU process
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/.devin/chrome/chrome/linux-156.0.8078.47/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.setViewportSize({ width: +w, height: +h });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 600)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(`http://localhost:5173/?dr=0&${query}`, { waitUntil: 'load' });
await page.waitForTimeout(+wait);
if (process.env.EVAL) { await page.evaluate(process.env.EVAL); await page.waitForTimeout(+(process.env.EVAL_WAIT || 3000)); }
const info = await page.evaluate(() => {
  const s = window.__snow; if (!s) return null;
  const gl = s.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?', calls: s.renderer.info.render.calls, tris: s.renderer.info.render.triangles, depth: s.state.depth, time: s.state.time };
});
try { await page.screenshot({ path: out, timeout: 120000 }); } catch (e) { console.log('SCREENSHOT FAILED', e.message.split('\n')[0]); }
console.log(JSON.stringify(info), `${Date.now() - t0}ms`);
console.log([...new Set(logs)].slice(0, 12).join('\n'));
await page.close();
await browser.close();
