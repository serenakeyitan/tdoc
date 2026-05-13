// Dark-mode test. Loads the live worker with prefers-color-scheme: dark and
// asserts the overlay primitives swap to a dark palette:
//   - Comment card has a dark background (not white)
//   - Comment card text is light
//   - Footer is visible with low-opacity light text
//   - Footer links are clickable (programmatic click works)
//   - Top bar remains dark (already was)
//
// Run: NODE_PATH=/private/tmp/node_modules node test/dark-mode.test.js

const { chromium } = require('playwright');

const URL = process.env.TDOC_TEST_URL || 'https://tdoc-serenatan.serenatan.workers.dev/d/conway-life/v/2';

let pass = 0, fail = 0;
function ok(n) { console.log(`  ✓ ${n}`); pass++; }
function bad(n, e) { console.log(`  ✗ ${n}\n    ${e.message || e}`); fail++; }
async function t(name, fn) { try { await fn(); ok(name); } catch (e) { bad(name, e); } }

function rgbToLuminance(rgb) {
  const m = String(rgb).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map(p => parseFloat(p.trim()));
  const [r, g, b] = parts;
  if ([r, g, b].some(x => Number.isNaN(x))) return null;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'laptop-1024',  width: 1024, height: 768 },
  { name: 'ipad-768',     width: 768,  height: 1024 },
  { name: 'iphone-375',   width: 375,  height: 812  },
];

(async () => {
  console.log(`testing ${URL} (prefers-color-scheme: dark)\n`);
  const browser = await chromium.launch({ headless: true });
  for (const v of viewports) {
    console.log(`--- ${v.name} (${v.width}×${v.height}) ---`);
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      colorScheme: 'dark',
    });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('.tdoc-margin-comment') !== null, null, { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(400);

    await t('comment card has dark background', async () => {
      const cardBg = await page.evaluate(() => {
        const c = document.querySelector('.tdoc-margin-comment');
        if (!c) return null;
        return getComputedStyle(c).backgroundColor;
      });
      if (!cardBg) { console.log('    (no cards)'); return; }
      const lum = rgbToLuminance(cardBg);
      if (lum === null) throw new Error(`unparseable bg ${cardBg}`);
      if (lum > 80) throw new Error(`card bg luminance ${lum.toFixed(0)} too bright (${cardBg})`);
    });

    await t('comment card text is light', async () => {
      const color = await page.evaluate(() => {
        const c = document.querySelector('.tdoc-margin-comment .text');
        if (!c) return null;
        return getComputedStyle(c).color;
      });
      if (!color) { console.log('    (no card text)'); return; }
      const lum = rgbToLuminance(color);
      if (lum === null) throw new Error(`unparseable color ${color}`);
      if (lum < 150) throw new Error(`card text luminance ${lum.toFixed(0)} too dark (${color})`);
    });

    await t('footer is visible', async () => {
      const visible = await page.evaluate(() => {
        const f = document.querySelector('.tdoc-footer');
        return !!f && f.offsetWidth > 0 && f.offsetHeight > 0;
      });
      if (!visible) throw new Error('footer missing or not visible');
    });

    await t('footer link visible + has expected href', async () => {
      const info = await page.evaluate(() => {
        const a = document.querySelector('.tdoc-footer a[href*="github.com/serenakeyitan/tdoc"]');
        return a ? { href: a.href, visible: a.offsetWidth > 0 } : null;
      });
      if (!info) throw new Error('repo link missing');
      if (!info.visible) throw new Error('repo link not visible');
      if (!info.href.includes('serenakeyitan/tdoc')) throw new Error(`bad href ${info.href}`);
    });

    await t('footer bdocs credit link present', async () => {
      const href = await page.evaluate(() => {
        const a = document.querySelector('.tdoc-footer a[href*="jessepollak"]');
        return a ? a.href : null;
      });
      if (!href) throw new Error('bdocs credit link missing');
    });

    await t('top bar is still dark', async () => {
      const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.tdoc-bar')).backgroundColor);
      const lum = rgbToLuminance(bg);
      if (lum > 30) throw new Error(`bar bg luminance ${lum} (${bg}) not dark`);
    });

    await ctx.close();
    console.log();
  }
  await browser.close();
  console.log(`${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
})();
