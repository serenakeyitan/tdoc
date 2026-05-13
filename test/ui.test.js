// Playwright UI test for tdoc published doc.
// Run with: node test/ui.test.js
// Tests against the live worker — no local server needed.

const { chromium } = require('playwright');

const URL = process.env.TDOC_TEST_URL || 'https://tdoc-serenatan.serenatan.workers.dev/d/conway-life/v/2';

let pass = 0, fail = 0;
function ok(name) { console.log(`  ✓ ${name}`); pass++; }
function bad(name, err) { console.log(`  ✗ ${name}\n    ${err}`); fail++; }
async function t(name, fn) { try { await fn(); ok(name); } catch (e) { bad(name, e.message); } }

(async () => {
  console.log(`testing ${URL}\n`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1400, height: 900 }
  });
  const page = await ctx.newPage();

  await page.goto(URL, { waitUntil: 'networkidle' });

  await t('top bar renders', async () => {
    await page.waitForSelector('.tdoc-bar', { timeout: 5000 });
  });

  await t('Copy button exists with icon + label', async () => {
    const btn = await page.$('#tdoc-copy-md-btn');
    if (!btn) throw new Error('no #tdoc-copy-md-btn');
    const label = await btn.textContent();
    if (!label.includes('Copy')) throw new Error(`label was "${label}"`);
    const svg = await btn.$('svg');
    if (!svg) throw new Error('no svg icon inside Copy button');
  });

  await t('Copy menu hidden by default', async () => {
    const open = await page.$('.tdoc-menu.open');
    if (open) throw new Error('menu is open before click');
  });

  await t('Click Copy opens menu with two options', async () => {
    await page.click('#tdoc-copy-md-btn');
    await page.waitForSelector('.tdoc-menu.open', { timeout: 1000 });
    const items = await page.$$eval('.tdoc-menu.open button', els => els.map(e => e.textContent.trim()));
    if (items.length !== 2) throw new Error(`expected 2 menu items, got ${items.length}: ${items.join(', ')}`);
    if (!items.includes('Doc only')) throw new Error(`no "Doc only": ${items.join(', ')}`);
    if (!items.includes('Doc + comments')) throw new Error(`no "Doc + comments": ${items.join(', ')}`);
  });

  await t('Click outside closes menu', async () => {
    await page.click('h1', { position: { x: 5, y: 5 } });
    await page.waitForTimeout(150);
    const open = await page.$('.tdoc-menu.open');
    if (open) throw new Error('menu stayed open after outside click');
  });

  await t('Doc only copy → clipboard has markdown', async () => {
    await page.click('#tdoc-copy-md-btn');
    await page.waitForSelector('.tdoc-menu.open');
    await page.click('.tdoc-menu.open button[data-mode="doc"]');
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    if (!clip || clip.length < 20) throw new Error(`clipboard too short: "${clip}"`);
    if (!clip.includes('#')) throw new Error('no markdown headings in clipboard');
    if (clip.includes('## Comments')) throw new Error('doc-only should not include Comments section');
  });

  await t('Copy button briefly shows "Copied" after copy', async () => {
    await page.click('#tdoc-copy-md-btn');
    await page.waitForSelector('.tdoc-menu.open');
    await page.click('.tdoc-menu.open button[data-mode="doc"]');
    // Within the 1200ms flash window, the button should read "Copied"
    await page.waitForFunction(
      () => document.querySelector('#tdoc-copy-md-btn')?.textContent?.includes('Copied'),
      null,
      { timeout: 800 }
    );
    // And revert afterward
    await page.waitForFunction(
      () => document.querySelector('#tdoc-copy-md-btn')?.textContent?.trim() === 'Copy',
      null,
      { timeout: 2000 }
    );
  });

  await t('Doc + comments copy → markdown includes Comments section if comments exist', async () => {
    await page.click('#tdoc-copy-md-btn');
    await page.waitForSelector('.tdoc-menu.open');
    await page.click('.tdoc-menu.open button[data-mode="doc-comments"]');
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const hasComments = await page.evaluate(() => document.querySelectorAll('.tdoc-margin-comment').length > 0);
    if (hasComments && !clip.includes('## Comments')) throw new Error('expected ## Comments section');
    if (!hasComments && clip.includes('## Comments')) throw new Error('no comments but section appeared');
  });

  await t('Anchor highlight is clickable (pointer cursor)', async () => {
    const cursor = await page.evaluate(() => {
      const m = document.querySelector('.tdoc-anchor-mark');
      if (!m) return 'no-mark';
      return getComputedStyle(m).cursor;
    });
    if (cursor === 'no-mark') return; // no comments to test; fine
    if (cursor !== 'pointer') throw new Error(`expected cursor:pointer on anchor mark, got "${cursor}"`);
  });

  await t('Hover outline + Comment pill appear over an unanchored canvas', async () => {
    const canvas = await page.$('canvas');
    if (!canvas) { console.log('  (no canvas in doc, skipping)'); return; }
    // If the canvas is already anchored, the hover UI is intentionally suppressed
    // (the existing comment owns the click). Skip in that case.
    const anchored = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c || !window.CSS || !CSS.highlights) return false;
      // Check any ::highlight() ranges touching the canvas (heuristic: any
      // tdoc-element-outline visible on the canvas)
      for (const o of document.querySelectorAll('.tdoc-element-outline')) {
        const r1 = c.getBoundingClientRect(), r2 = o.getBoundingClientRect();
        if (Math.abs(r1.left - r2.left) < 6 && Math.abs(r1.top - r2.top) < 6) return true;
      }
      return false;
    });
    if (anchored) { console.log('  (canvas already anchored, skipping)'); return; }
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForSelector('.tdoc-hover-outline', { timeout: 2000 });
    await page.waitForSelector('.tdoc-comment-pill', { timeout: 1000 });
  });

  await t('Plain click on canvas does NOT open popup (passes through)', async () => {
    const canvas = await page.$('canvas');
    if (!canvas) { console.log('  (no canvas, skipping)'); return; }
    const box = await canvas.boundingBox();
    // Single click, no drag
    await page.mouse.click(box.x + 50, box.y + 50);
    await page.waitForTimeout(250);
    const popup = await page.$('.tdoc-popup');
    if (popup) throw new Error('plain click should not open popup with drag-to-comment');
  });

  await t('Drag FROM OUTSIDE canvas INTO canvas opens comment popup with element anchor preview', async () => {
    const canvas = await page.$('canvas');
    if (!canvas) { console.log('  (no canvas, skipping)'); return; }
    // If the canvas is already an existing comment's anchor, this gesture is
    // intentionally a no-op (the comment already exists). Skip the test.
    const alreadyAnchored = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return false;
      for (const a of document.querySelectorAll('.tdoc-element-outline')) {
        if (a._targetEl === c || a.dataset.commentId) {
          const r1 = c.getBoundingClientRect();
          const r2 = a.getBoundingClientRect();
          if (Math.abs(r1.left - r2.left) < 5 && Math.abs(r1.top - r2.top) < 5) return true;
        }
      }
      return false;
    });
    if (alreadyAnchored) { console.log('  (canvas already anchored by an existing comment, skipping)'); return; }
    const box = await canvas.boundingBox();
    const startX = Math.max(20, box.x - 30);
    const startY = box.y + 20;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 60, { steps: 10 });
    await page.mouse.up();
    await page.waitForSelector('.tdoc-popup', { timeout: 2000 });
    const header = await page.$eval('.tdoc-popup .head .h', el => el.textContent);
    if (!header.includes('📎') && !header.includes('canvas')) {
      throw new Error(`expected element-anchor preview, got "${header}"`);
    }
    await page.click('.tdoc-popup .head .x');
    await page.waitForTimeout(150);
  });

  await t('Drag STARTED INSIDE canvas does NOT open popup (passes through)', async () => {
    const canvas = await page.$('canvas');
    if (!canvas) { console.log('  (no canvas, skipping)'); return; }
    const box = await canvas.boundingBox();
    // Both points inside canvas.
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 200, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const popup = await page.$('.tdoc-popup');
    if (popup) throw new Error('drag starting inside canvas should not open popup');
  });

  await t('Click on a button inside doc does NOT open popup', async () => {
    const btn = await page.$('button#play, button#reset');
    if (!btn) { console.log('  (no doc button to test, skipping)'); return; }
    await btn.click();
    await page.waitForTimeout(200);
    const popup = await page.$('.tdoc-popup');
    if (popup) throw new Error('popup opened from clicking a doc button — should be skipped');
  });

  await t('Click on existing comment card adds .active to card + anchor', async () => {
    const card = await page.$('.tdoc-margin-comment');
    if (!card) { console.log('  (no comments to test, skipping)'); return; }
    // Click the author row (text), not the body — avoids hitting reaction chips
    // and other interactive children that stopPropagation.
    const author = await card.$('.author');
    if (author) await author.click();
    else await card.click({ position: { x: 30, y: 10 } });
    await page.waitForTimeout(150);
    const state = await page.evaluate(() => ({
      activeCards: document.querySelectorAll('.tdoc-margin-comment.active').length,
      activeMarks: document.querySelectorAll('.tdoc-anchor-mark.active, .tdoc-element-outline.active').length,
    }));
    if (state.activeCards !== 1) throw new Error(`expected 1 active card, got ${state.activeCards}`);
    if (state.activeMarks < 1) throw new Error(`expected anchor to be active, got ${state.activeMarks}`);
  });

  await t('Click on a comment-anchored text highlight activates the matching card', async () => {
    // Deselect first
    await page.evaluate(() => document.querySelectorAll('.active').forEach(el => el.classList.remove('active')));
    const mark = await page.$('.tdoc-anchor-mark');
    if (!mark) { console.log('  (no text-anchored comments, skipping)'); return; }
    await mark.click();
    await page.waitForTimeout(150);
    const activeCards = await page.$$eval('.tdoc-margin-comment.active', els => els.length);
    if (activeCards !== 1) throw new Error(`expected 1 active card after anchor click, got ${activeCards}`);
  });

  await t('Clicking outside any card / anchor deselects the active card', async () => {
    // Activate a card via its author row (avoid reaction chip stopPropagation)
    const card = await page.$('.tdoc-margin-comment');
    if (!card) { console.log('  (no cards, skipping)'); return; }
    const author = await card.$('.author');
    if (author) await author.click();
    else await card.click({ position: { x: 30, y: 10 } });
    await page.waitForTimeout(100);
    let activeCount = await page.$$eval('.tdoc-margin-comment.active', els => els.length);
    if (activeCount !== 1) throw new Error(`expected 1 active before outside-click, got ${activeCount}`);
    // Click in the H1 area on the doc — outside any UI
    await page.click('h1', { position: { x: 5, y: 5 } });
    await page.waitForTimeout(150);
    activeCount = await page.$$eval('.tdoc-margin-comment.active', els => els.length);
    if (activeCount !== 0) throw new Error(`expected 0 active after outside-click, got ${activeCount}`);
  });

  await t('Sign-in button visible (anon view)', async () => {
    const btn = await page.$('#tdoc-signin');
    if (!btn) throw new Error('no sign-in button; expected on published anon view');
  });

  await t('Comment card renders Reply button', async () => {
    const reply = await page.$('.tdoc-reply-toggle');
    if (!reply) throw new Error('no Reply button on comment card');
  });

  await t('Comment card renders + React button', async () => {
    const addReact = await page.$('.tdoc-react-add');
    if (!addReact) throw new Error('no + React button on comment card');
  });

  await t('Reply form is hidden by default', async () => {
    const open = await page.$('.tdoc-reply-form.open');
    if (open) throw new Error('reply form open by default');
  });

  await t('Replies are collapsed by default (toggle exists, replies hidden)', async () => {
    // Note: only applies to comments that actually have replies. If none in fixture, skip.
    const togglePresent = await page.$('.tdoc-replies-toggle');
    if (!togglePresent) { console.log('  (no replies in fixture, skipping)'); return; }
    const openReplies = await page.$('.tdoc-replies.open');
    if (openReplies) throw new Error('replies open by default');
    const text = await togglePresent.evaluate(el => el.textContent.trim());
    if (!/\d+ repl(y|ies)/.test(text)) throw new Error(`toggle text was "${text}"`);
  });

  await t('Clicking replies toggle expands replies', async () => {
    const toggle = await page.$('.tdoc-replies-toggle');
    if (!toggle) { console.log('  (no replies in fixture, skipping)'); return; }
    await toggle.click();
    await page.waitForSelector('.tdoc-replies.open', { timeout: 1000 });
    // Collapse again
    await toggle.click();
    await page.waitForTimeout(200);
    const stillOpen = await page.$('.tdoc-replies.open');
    if (stillOpen) throw new Error('replies did not collapse on second click');
  });

  await t('Clicking + React on anon view triggers sign-in (no picker)', async () => {
    // Anon: should NOT open the emoji picker — should redirect to sign-in modal.
    await page.click('.tdoc-react-add');
    // Modal appears after the device/start network round-trip (~1-2s).
    try {
      await page.waitForSelector('#tdoc-device-modal', { timeout: 5000 });
    } catch {
      throw new Error('expected device-flow modal to appear');
    }
    const picker = await page.$('.tdoc-emoji-picker');
    if (picker) throw new Error('emoji picker opened without sign-in');
    await page.click('#tdoc-modal-cancel');
    await page.waitForTimeout(150);
  });

  // ----- Feature: Share button on published view -----
  await t('Share button visible on published view (left of Copy)', async () => {
    const share = await page.$('#tdoc-share-btn');
    if (!share) throw new Error('no #tdoc-share-btn on published doc');
    const text = await share.textContent();
    if (!text.includes('Share')) throw new Error(`label was "${text}"`);
  });

  await t('Click Share opens modal with URL + Copy button', async () => {
    await page.click('#tdoc-share-btn');
    await page.waitForSelector('#tdoc-aux-modal', { timeout: 2000 });
    const url = await page.$eval('#tdoc-share-url', el => el.textContent.trim());
    if (!url.startsWith('http')) throw new Error(`url didn't look right: "${url}"`);
    const copyBtn = await page.$('#tdoc-share-copy');
    if (!copyBtn) throw new Error('Share modal missing Copy button');
    // "Open in new tab" was removed in v0.1.16 — explicitly assert it's gone.
    const openBtn = await page.$('#tdoc-share-open');
    if (openBtn) throw new Error('Share modal still has stale Open-in-new-tab button');
    const unpub = await page.$('#tdoc-share-unpub');
    if (!unpub) throw new Error('Share modal missing unpublish hint');
    const unpubText = await unpub.textContent();
    if (!unpubText.includes('/tdoc unpublish')) throw new Error(`unpublish text was "${unpubText}"`);
  });

  await t('Share modal closes', async () => {
    await page.click('#tdoc-share-close');
    await page.waitForTimeout(150);
    const m = await page.$('#tdoc-aux-modal');
    if (m) throw new Error('Share modal did not close');
  });

  // ----- Feature: Fork mode renderable URL -----
  await t('Fork URL loads in fork mode (read-only, comments mirrored)', async () => {
    const forkPage = await ctx.newPage();
    const u = URL.replace(/\/?$/, '') + '/fork';
    await forkPage.goto(u, { waitUntil: 'networkidle' });
    // Title slug should say "fork of …"
    const slug = await forkPage.$eval('.tdoc-bar .slug', el => el.textContent);
    if (!slug.toLowerCase().includes('fork of')) throw new Error(`expected "fork of" in slug, got "${slug}"`);
    // Save button should be present (in narrow mode it may be hidden; we're at 1400px)
    const saveBtn = await forkPage.$('#tdoc-saveas-btn');
    if (!saveBtn) throw new Error('no #tdoc-saveas-btn in fork mode');
    // No reply form should exist (read-only)
    const replyForm = await forkPage.$('.tdoc-reply-form');
    if (replyForm) throw new Error('reply form present in fork mode (should be read-only)');
    // No Reply toggle either
    const replyToggle = await forkPage.$('.tdoc-reply-toggle');
    if (replyToggle) throw new Error('Reply button present in fork mode');
    // Share button hidden
    const shareBtn = await forkPage.$('#tdoc-share-btn');
    if (shareBtn) throw new Error('Share button visible in fork mode');
    await forkPage.close();
  });

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
})();
