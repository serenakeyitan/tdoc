// Overlay pure-function tests (partial resolution of #23).
//
// The review flagged the 2758-line overlay IIFE as having "no unit-testable
// surface". A full decomposition into ES modules + bundle change is deferred
// (high-risk: the overlay is almost all un-runnable DOM code). This test takes
// the pragmatic first step: it gives the genuinely PURE functions (string/math,
// no DOM) real unit coverage by VM-extracting them from the source — so the
// anchor-matching string core is now guarded against regression, and these
// functions become a documented, testable surface.
//
// Pure functions covered: escapeHtml, normalizeNeedle, normalizeContext,
// normalizeQuery, commonPrefixLen, commonSuffixLen.
//
// Run with: node test/overlay-pure.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(n) { console.log(`  ✓ ${n}`); pass++; }
function bad(n, e) { console.log(`  ✗ ${n}\n    ${e}`); fail++; }
function t(n, fn) { try { fn(); ok(n); } catch (e) { bad(n, e.message); } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'overlay.js'), 'utf8');
function sliceFn(name) {
  // overlay functions are indented inside the IIFE; match `function name(`
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`fn ${name} not found in overlay.js`);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const box = {};
vm.createContext(box);
vm.runInContext([
  'escapeHtml', 'normalizeNeedle', 'normalizeContext', 'normalizeQuery',
  'commonPrefixLen', 'commonSuffixLen',
].map(sliceFn).join('\n\n'), box);
const { escapeHtml, normalizeNeedle, normalizeContext, normalizeQuery,
        commonPrefixLen, commonSuffixLen } = box;

console.log('overlay-pure (#23 testable surface)');

// escapeHtml — the overlay renders comment text/author via innerHTML, so this
// is the XSS-relevant escaper.
t('escapeHtml encodes all five dangerous characters', () => {
  assert(escapeHtml(`<a href="x" onclick='y'>&`) === '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
});
t('escapeHtml coerces non-strings without throwing', () => {
  assert(escapeHtml(42) === '42');
  assert(escapeHtml(null) === 'null');
});
t('escapeHtml leaves safe text untouched', () => {
  assert(escapeHtml('hello world 123') === 'hello world 123');
});

// normalize* — used by text-anchor matching; whitespace collapsing must be
// consistent or anchors drift.
t('normalizeNeedle collapses internal whitespace and trims', () => {
  assert(normalizeNeedle('  a   b\n\tc  ') === 'a b c');
  assert(normalizeNeedle('') === '');
  assert(normalizeNeedle(null) === '');
});
t('normalizeContext collapses whitespace but does NOT trim (preserves edges)', () => {
  assert(normalizeContext('  a  b  ') === ' a b ');
  assert(normalizeContext(null) === '');
});
t('normalizeQuery aliases normalizeNeedle', () => {
  assert(normalizeQuery('  x   y  ') === normalizeNeedle('  x   y  '));
});

// common prefix/suffix — used by the fuzzy re-anchor fallback.
t('commonPrefixLen counts the shared leading run', () => {
  assert(commonPrefixLen('abcXYZ', 'abcDEF') === 3);
  assert(commonPrefixLen('', 'abc') === 0);
  assert(commonPrefixLen('same', 'same') === 4);
});
t('commonSuffixLen counts the shared trailing run', () => {
  assert(commonSuffixLen('XYZabc', 'DEFabc') === 3);
  assert(commonSuffixLen('abc', '') === 0);
  assert(commonSuffixLen('tail', 'tail') === 4);
});
t('prefix/suffix handle no-overlap', () => {
  assert(commonPrefixLen('abc', 'xyz') === 0);
  assert(commonSuffixLen('abc', 'xyz') === 0);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
