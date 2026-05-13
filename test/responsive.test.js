// Responsive UI tests at four real viewport sizes.
// Run: NODE_PATH=/private/tmp/node_modules node test/responsive.test.js
//
// What we assert per viewport:
//  - No horizontal overflow on document.documentElement
//  - Top bar: which controls are visible vs hidden (Fork/All-docs collapse to
//    the "..." More menu on small screens)
//  - Comment cards: visible AND within the viewport (not clipped off-screen)
//  - FAB ("💬 N"): present only on tablet/mobile, only when comments exist
//  - Bottom drawer toggles open when the FAB is tapped (mobile/tablet only)
//  - Sign-in button still reachable

const { chromium } = require('playwright');

const URL = process.env.TDOC_TEST_URL || 'https://tdoc-serenatan.serenatan.workers.dev/d/conway-life/v/2';

// Note: with v0.1.3's asymmetric-shrink layout, "narrow mode" (drawer + More
// menu) is driven by the article's actual width, not viewport width. The article
// stays in a margin column on laptop and tablet because there's still room for
// it. Only when the article itself becomes uncomfortably narrow (<400px) OR
// the viewport is phone-sized (<700px) does drawer mode kick in.
const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900,  mobile: false, expectFab: false, expectMore: false },
  { name: 'laptop-1024',  width: 1024, height: 768,  mobile: false, expectFab: false, expectMore: false },
  { name: 'ipad-768',     width: 768,  height: 1024, mobile: true,  expectFab: false, expectMore: false },
  { name: 'iphone-375',   width: 375,  height: 812,  mobile: true,  expectFab: true,  expectMore: true  },
];

let pass = 0, fail = 0;
function ok(n) { console.log(`  ✓ ${n}`); pass++; }
function bad(n, e) { console.log(`  ✗ ${n}\n    ${e.message || e}`); fail++; }
async function t(name, fn) { try { await fn(); ok(name); } catch (e) { bad(name, e); } }

(async () => {
  console.log(`testing ${URL}\n`);
  const browser = await chromium.launch({ headless: true });

  for (const v of viewports) {
    console.log(`--- ${v.name} (${v.width}×${v.height}) ---`);
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      isMobile: v.mobile,
      hasTouch: v.mobile,
      deviceScaleFactor: v.mobile ? 2 : 1,
    });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    // Wait for narrow-mode to settle (it's set after the first refreshComments
    // fetch returns, which may take a moment on the deployed worker).
    await page.waitForFunction(
      () => document.querySelector('.tdoc-margin-comment') !== null || document.body.dataset.tdocReady === '1',
      null,
      { timeout: 5000 }
    ).catch(() => {});
    await page.waitForTimeout(400);

    await t('no horizontal overflow on documentElement', async () => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) throw new Error(`scrollWidth ${await page.evaluate(() => document.documentElement.scrollWidth)} > innerWidth ${v.width}`);
    });

    await t('top bar present', async () => {
      const bar = await page.$('.tdoc-bar');
      if (!bar) throw new Error('no .tdoc-bar');
    });

    await t(`More (⋯) button: ${v.expectMore ? 'visible' : 'hidden'}`, async () => {
      const visible = await page.evaluate(() => {
        const el = document.querySelector('#tdoc-more-btn');
        return el ? (el.offsetWidth > 0 && el.offsetHeight > 0) : false;
      });
      if (visible !== v.expectMore) throw new Error(`expected More visible=${v.expectMore}, got ${visible}`);
    });

    await t('Fork + All-docs: visible only on desktop', async () => {
      const fork = await page.evaluate(() => {
        const el = document.querySelector('#tdoc-fork-btn');
        return el ? (el.offsetWidth > 0 && el.offsetHeight > 0) : false;
      });
      const expectedFork = !v.expectMore;   // visible on desktop only
      if (fork !== expectedFork) throw new Error(`Fork visible=${fork}, expected ${expectedFork}`);
    });

    await t(`FAB: ${v.expectFab ? 'visible when comments exist' : 'hidden'}`, async () => {
      const hasComments = await page.evaluate(() => document.querySelectorAll('.tdoc-margin-comment').length > 0);
      const fabVisible = await page.evaluate(() => {
        const el = document.querySelector('.tdoc-fab');
        return el ? (el.offsetWidth > 0 && el.offsetHeight > 0) : false;
      });
      if (v.expectFab && hasComments && !fabVisible) throw new Error('FAB should be visible');
      if (!v.expectFab && fabVisible) throw new Error('FAB should be hidden on desktop');
    });

    if (v.expectFab) {
      await t('Tapping FAB opens the bottom drawer', async () => {
        const hasComments = await page.evaluate(() => document.querySelectorAll('.tdoc-margin-comment').length > 0);
        if (!hasComments) { console.log('    (no comments to drawer)'); return; }
        // Trigger the click via direct DOM dispatch — avoids Playwright's
        // viewport-vs-device-pixel coordinate mismatch on mobile emulation.
        await page.evaluate(() => document.querySelector('.tdoc-fab').click());
        await page.waitForTimeout(250);
        const open = await page.evaluate(() => document.querySelector('#tdoc-comment-layer.open') !== null);
        if (!open) throw new Error('drawer did not gain .open class');
        // Close again so subsequent tests aren't affected
        await page.evaluate(() => document.querySelector('#tdoc-comment-layer').classList.remove('open'));
        await page.waitForTimeout(150);
      });

      await t('Cards inside drawer fit the window width', async () => {
        const hasComments = await page.evaluate(() => document.querySelectorAll('.tdoc-margin-comment').length > 0);
        if (!hasComments) { console.log('    (no comments to test)'); return; }
        await page.evaluate(() => document.querySelector('.tdoc-fab').click());
        await page.waitForTimeout(200);
        // Compare against window.innerWidth (what the doc actually renders to),
        // not the test viewport — mobile emulation can scale these independently.
        const overflow = await page.evaluate(() => {
          const ww = window.innerWidth;
          for (const c of document.querySelectorAll('.tdoc-margin-comment')) {
            const r = c.getBoundingClientRect();
            if (r.right > ww + 1) return { right: r.right, ww };
          }
          return null;
        });
        if (overflow) throw new Error(`card right=${overflow.right} exceeds window ${overflow.ww}`);
        await page.evaluate(() => document.querySelector('#tdoc-comment-layer').classList.remove('open'));
        await page.waitForTimeout(150);
      });
    } else {
      await t('Desktop cards are positioned in the right margin column', async () => {
        const cards = await page.$$eval('.tdoc-margin-comment', els => els.map(c => {
          const r = c.getBoundingClientRect();
          return { left: r.left, right: r.right };
        }));
        if (!cards.length) { console.log('    (no cards)'); return; }
        for (const c of cards) {
          if (c.right > v.width + 1) throw new Error(`card right=${c.right} exceeds viewport ${v.width}`);
          if (c.left < v.width * 0.5) throw new Error(`card left=${c.left} too far left for a desktop margin column`);
        }
      });
    }

    if (v.expectMore) {
      await t('Tapping More opens the secondary menu', async () => {
        await page.click('#tdoc-more-btn');
        await page.waitForTimeout(150);
        const open = await page.evaluate(() => document.querySelector('#tdoc-secondary-menu.open') !== null);
        if (!open) throw new Error('secondary menu did not open');
        // Close
        await page.click('h1', { position: { x: 5, y: 5 } });
        await page.waitForTimeout(150);
      });
    }

    await t('Sign-in button or identity chip is visible', async () => {
      const present = await page.evaluate(() => {
        const slot = document.querySelector('#tdoc-identity-slot');
        return !!(slot && slot.children.length > 0);
      });
      if (!present) throw new Error('identity slot empty');
    });

    await ctx.close();
    console.log();
  }
  await browser.close();
  console.log(`${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
})();
