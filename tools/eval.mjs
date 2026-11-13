// Usage: node tools/eval.mjs "<query>" "<js expression>" [waitMs]
import { chromium } from 'playwright-core';
const [query = '', expr = '1', wait = '5000'] = process.argv.slice(2);
const browser = await chromium.connectOverCDP('http://localhost:29229');
const page = await browser.contexts()[0].newPage();
await page.setViewportSize({ width: 960, height: 540 });
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 800)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:5173/?${query}`, { waitUntil: 'load' });
await page.waitForTimeout(+wait);
console.log(JSON.stringify(await page.evaluate(expr), null, 1));
await page.close(); await browser.close();
