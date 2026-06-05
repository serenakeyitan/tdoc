// Test for the old-version strip decision logic (overlay.js).
//
// The strip is a quiet, single-direction nudge shown ONLY when a published
// viewer is on a non-latest version. This test pins the exact show/hide
// predicate so a future overlay refactor can't silently regress it (e.g.
// showing the strip in fork mode, or on the latest version).
//
// It verifies the predicate against the SAME source line in overlay.js, so
// the test fails if the guard condition is weakened.
//
// Run with: node test/oldver-strip.test.js

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(n) { console.log(`  ✓ ${n}`); pass++; }
function bad(n, e) { console.log(`  ✗ ${n}\n    ${e}`); fail++; }
function t(n, fn) { try { fn(); ok(n); } catch (e) { bad(n, e.message); } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

// --- The predicate, mirrored from overlay.js bar-setup. ---
// published mode + more than one version + current strictly older than latest.
function shouldShowStrip(mode, version, versions) {
  const isPublished = mode === 'published';
  const vs = Array.isArray(versions) && versions.length ? versions.slice() : [{ n: version }];
  vs.sort((a, b) => (a.n || 0) - (b.n || 0));
  if (!(isPublished && vs.length > 1)) return false;
  const latest = vs[vs.length - 1].n;
  return typeof version === 'number' && version < latest;
}

function latestUrl(slug, latest) {
  return `/d/${encodeURIComponent(slug)}/v/${latest}`;
}

const V = [{ n: 1 }, { n: 2 }, { n: 3 }];

console.log('oldver-strip (show only for published + non-latest)');

t('SHOW: published viewer on v1 with v3 latest', () => {
  assert(shouldShowStrip('published', 1, V) === true);
});

t('SHOW: published viewer on v2 with v3 latest', () => {
  assert(shouldShowStrip('published', 2, V) === true);
});

t('HIDE: published viewer already on latest (v3)', () => {
  assert(shouldShowStrip('published', 3, V) === false, 'must not nag on the latest version');
});

t('HIDE: fork mode never shows the strip', () => {
  assert(shouldShowStrip('fork', 1, V) === false, 'fork mode must not show version nudge');
});

t('HIDE: local mode never shows the strip', () => {
  assert(shouldShowStrip('local', 1, V) === false);
});

t('HIDE: single-version doc (no older versions to leave)', () => {
  assert(shouldShowStrip('published', 1, [{ n: 1 }]) === false);
});

t('HIDE: versions array unsorted but v3 still recognized as latest', () => {
  assert(shouldShowStrip('published', 1, [{ n: 3 }, { n: 1 }, { n: 2 }]) === true);
  assert(shouldShowStrip('published', 3, [{ n: 3 }, { n: 1 }, { n: 2 }]) === false);
});

t('link points at the latest version with encoded slug', () => {
  assert(latestUrl('my-doc', 3) === '/d/my-doc/v/3');
  assert(latestUrl('a b/c', 2) === '/d/a%20b%2Fc/v/2', 'slug must be URL-encoded');
});

// Guard: the real overlay.js must still contain the exact predicate so this
// test stays coupled to the source. If the guard line changes shape, update
// both together (and re-confirm the cases above).
t('overlay.js still contains the published+multi-version guard', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'overlay.js'), 'utf8');
  assert(src.includes('isPublished && versions.length > 1'),
    'guard condition missing/changed in overlay.js — re-verify show/hide cases');
  assert(src.includes('version < latestVersion'),
    'non-latest comparison missing/changed in overlay.js');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
