import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/.devin/chrome/chrome/linux-156.0.8078.47/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog', '--disable-dev-shm-usage'],
});
const page = await (await browser.newContext()).newPage();
await page.setViewportSize({ width: 960, height: 600 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => logs.push('PAGEERR ' + e.message));
await page.goto('http://localhost:5173/?q=low&time=20', { waitUntil: 'load' });
await page.waitForTimeout(5000);
const out = '/home/ubuntu/work/shots/';
await page.screenshot({ path: out + 'u1.png' });
const st = () => page.evaluate(() => { const s = window.__snow.state; return { curve: s.curve.slice(0, 8), time: +s.time.toFixed(2), playing: s.playing, temp: s.temp, wind: s.wind, depth: +s.depth.toFixed(3), sound: s.sound, autoCam: s.autoCam }; });
console.log('initial', JSON.stringify(await st()));
// drag node 3 upward
const hit = page.locator('#curve .hit').nth(3);
const b = await hit.boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
await page.mouse.move(b.x + b.width / 2, b.y - 60, { steps: 5 }); await page.mouse.up();
console.log('after drag', JSON.stringify(await st()));
// precise input
await page.locator('details summary').first().click().catch(() => {});
const inp = page.locator('#grid input').nth(5);
await inp.scrollIntoViewIfNeeded(); await inp.fill('7.3'); await inp.blur();
console.log('after input', JSON.stringify(await st()));
await page.screenshot({ path: out + 'u2.png' });
// preset
await page.locator('#presets button', { hasText: '暴风雪' }).click();
await page.waitForTimeout(2500);
console.log('after preset', JSON.stringify(await st()));
// slider
await page.locator('#sliders input').nth(0).fill('-15');
console.log('after temp', JSON.stringify(await st()));
// play toggle & keyboard
await page.locator('#btnPlay').click(); console.log('after play btn', JSON.stringify(await st()));
await page.locator('#view').click({ position: { x: 800, y: 300 } });
await page.keyboard.press('Space'); console.log('after space', JSON.stringify(await st()));
// natural accumulation: heavy snow from bare ground, playing
await page.locator('#presets button', { hasText: '鹅毛大雪' }).click();
await page.evaluate(() => { const s = window.__snow.state; s.depth = 0; s.playing = true; });
await page.waitForTimeout(15000);
console.log('accumulated', JSON.stringify(await st()));
await page.evaluate(() => { window.__snow.state.playing = false; });
// manual depth
await page.locator('#sliders input').last().fill('0.4'); console.log('manual depth', JSON.stringify(await st()));
await page.locator('#btnSound').click(); await page.locator('#btnCam').click(); console.log('sound/cam', JSON.stringify(await st()));
await page.locator('#btnClear').click(); console.log('clear', JSON.stringify(await st()));
await page.screenshot({ path: out + 'u3.png' });
await page.keyboard.press('h'); await page.waitForTimeout(1500);
console.log('hide-ui', await page.evaluate(() => document.body.className));
await page.keyboard.press('h');
await page.locator('#btnPanel').click(); await page.waitForTimeout(1500);
await page.screenshot({ path: out + 'u4.png' });
// mobile
await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#btnPanel').click().catch(() => {}); await page.waitForTimeout(2500);
await page.screenshot({ path: out + 'u5.png' });
console.log('logs', JSON.stringify([...new Set(logs)]));
await page.close(); await browser.close();
