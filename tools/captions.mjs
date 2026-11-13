// Renders caption overlays (transparent 1080x1920 PNGs) for the promo.
import { chromium } from '/home/ubuntu/repos/snow-night/node_modules/playwright-core/index.mjs';
const CAPS = [
  { id: 'hook', cls: 'hero', tag: 'VIBE CODING 作品', h: '我 Vibe Coding 了一个<br>会下雪的网页', s: '' },
  { id: 'curve', tag: '01 · 数据驱动', h: '拖一拖降雪曲线', s: '24 小时 25 个点，雪跟着数据下' },
  { id: 'pile', tag: '02 · 自然积雪', h: '下得越久，雪越厚', s: '屋顶、围栏、地面一点点堆起来' },
  { id: 'sky', tag: '03 · 昼夜流转', h: '白天 · 夕阳 · 极光', s: '时间一走，天色跟着变' },
  { id: 'storm', tag: '04 · 气候可调', h: '一键切到暴风雪', s: '气温、风速、雾气都能调' },
  { id: 'end', cls: 'hero', tag: 'VIBE CODING × THREE.JS', h: '一个 HTML<br>浏览器实时渲染', s: '没用虚幻引擎 · 代码全由 AI 写' },
];
const html = (c) => `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; width: 1080px; height: 1920px; background: transparent; overflow: hidden; }
  body { font-family: 'Noto Sans CJK SC', sans-serif; color: #fff; }
  .shade { position: absolute; inset: 0 0 auto 0; height: 700px; background: linear-gradient(to bottom, rgba(4,8,18,.62), rgba(4,8,18,.36) 55%, rgba(4,8,18,0)); }
  .wrap { position: absolute; left: 0; right: 0; top: 168px; text-align: center; }
  .hero .wrap { top: 236px; }
  .tag { display: inline-block; padding: 9px 26px 10px; border-radius: 999px; font-size: 30px; font-weight: 700; letter-spacing: 5px; text-indent: 5px;
    color: #fff3d6; background: rgba(255,190,110,.18); border: 2px solid rgba(255,214,150,.75); text-shadow: 0 2px 8px rgba(0,0,0,.5); }
  h1 { margin: 26px 0 0; font-size: 84px; line-height: 1.24; font-weight: 700; letter-spacing: 2px;
    text-shadow: 0 4px 22px rgba(0,0,0,.75), 0 1px 3px rgba(0,0,0,.8); }
  .hero h1 { font-size: 92px; margin-top: 34px; }
  p { margin: 20px 0 0; font-size: 42px; font-weight: 400; letter-spacing: 2px; color: #e9eefc; text-shadow: 0 3px 14px rgba(0,0,0,.85), 0 1px 3px rgba(0,0,0,.8); }
  em { font-style: normal; color: #ffd28a; }
</style><body class="${c.cls || ''}"><div class="shade"></div><div class="wrap"><span class="tag">${c.tag}</span><h1>${c.h}</h1>${c.s ? `<p>${c.s}</p>` : ''}</div>`;
const browser = await chromium.launch({ executablePath: '/opt/.devin/chrome/chrome/linux-156.0.8078.47/chrome-linux64/chrome', args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })).newPage();
for (const c of CAPS) {
  await page.setContent(html(c)); await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `cap_${c.id}.png`, omitBackground: true });
}
await browser.close(); console.log('captions ok');
