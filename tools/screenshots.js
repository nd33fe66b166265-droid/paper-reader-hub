/* README の画面写真を撮る（見本の教材で。自作の英文なので公開してよい）
   使い方:
     cd hub && python3 -m http.server 8765 &      # アプリをローカルで開く
     node tools/screenshots.js /tmp/shots         # Playwright（Chromium）で撮る
   スマホの大きさ（390×780、2倍）で、ライトとダークの両方を撮る。
   docs/images/ に置くものは、色数を減らして軽くしてから入れた（PIL の quantize(128)）。 */
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch();
  for (const scheme of ['light','dark']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, colorScheme: scheme, locale: 'ja-JP' });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(process.env.HUB_URL || 'http://localhost:8765/index.html'); await p.waitForTimeout(1500);
  await p.addStyleTag({ content: '#toast{display:none!important}' });
  await p.click('#openImport'); await p.waitForTimeout(300);
  await p.click('#imSample'); await p.waitForTimeout(1000);
  await p.screenshot({ path: `${out}/import-${scheme}.png` });
  await p.click('#imGo'); await p.waitForTimeout(1000);
  await p.click('[data-im-read]'); await p.waitForTimeout(1200);
  const a = p.locator('article.para').first();
  await a.locator('.ja-btn').click(); await a.locator('.note-btn').click();
  await p.locator('article.para t').first().click().catch(()=>{});
  await a.scrollIntoViewIfNeeded(); await p.evaluate(() => { const r=document.querySelector('article.para').getBoundingClientRect(); window.scrollBy(0, r.top - 70); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/read-${scheme}.png` });
  await p.evaluate(() => window.scrollTo(0,0));
  await p.click('#tab-today'); await p.waitForTimeout(500);
  const later = p.locator('[data-ap-later]'); if (await later.count()) await later.first().click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/today-${scheme}.png` });
  await p.click('#tab-review'); await p.waitForTimeout(600);
  const sr = p.locator('#view-review button.primary'); if (await sr.count()) { await sr.first().click(); await p.waitForTimeout(500); }
  const rv = p.locator('#revealBtn'); if (await rv.count()) { await rv.click(); await p.waitForTimeout(400); }
  await p.screenshot({ path: `${out}/review-${scheme}.png` });
  await p.click('#tab-write'); await p.waitForTimeout(800);
  await p.locator('#view-write textarea').first().fill('This section explains how to read a research paper efficiently. The author suggests starting with the abstract, because it summarizes what the authors did and found. Figures are also important since they show the main results clearly.');
  await p.locator('#view-write button', { hasText: '添削する' }).first().click(); await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/write-${scheme}.png` });
  await ctx.close();
  }
  await b.close();
})();
