// P3 hardening tests (#33): safeParseList + escapeHtml.
//
// Covers the two reusable hardening helpers added for the #33 backlog:
//  - safeParseList: a corrupt/non-array stored comments value must degrade to []
//    (so one bad KV value can't 500 a slug forever), not throw.
//  - escapeHtml: full escaping (text + attribute contexts) for the catalog pages,
//    which previously escaped only `<`.
//
// Run with: node test/p3-hardening.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(n) { console.log(`  ✓ ${n}`); pass++; }
function bad(n, e) { console.log(`  ✗ ${n}\n    ${e}`); fail++; }
function t(n, fn) { try { fn(); ok(n); } catch (e) { bad(n, e.message); } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'worker.js'), 'utf8');
function fn(name) {
  const s = src.indexOf(`function ${name}(`);
  if (s === -1) throw new Error(`fn ${name} not found`);
  let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) { i++; break; } } }
  return src.slice(s, i);
}
const box = { console: { error() {} } };
vm.createContext(box);
vm.runInContext([fn('safeParseList'), fn('escapeHtml')].join('\n\n'), box);
const { safeParseList, escapeHtml } = box;

console.log('p3-hardening (#33)');

t('safeParseList: valid array passes through', () => {
  assert(JSON.stringify(safeParseList('[{"id":"c1"}]')) === '[{"id":"c1"}]');
});
t('safeParseList: empty/null → []', () => {
  assert(safeParseList(null).length === 0);
  assert(safeParseList('').length === 0);
});
t('safeParseList: corrupt JSON → [] (no throw — slug self-heals)', () => {
  assert(safeParseList('{not json').length === 0);
  assert(safeParseList('{"id":"x"').length === 0);
});
t('safeParseList: valid JSON that is NOT an array → [] (prevents ensureMigrated crash)', () => {
  assert(safeParseList('{"id":"x"}').length === 0);  // object, not array
  assert(safeParseList('"a string"').length === 0);
  assert(safeParseList('42').length === 0);
});

t('escapeHtml: escapes all five chars (text + attribute safe)', () => {
  assert(escapeHtml(`<a href="x" onclick='y'>&`) === '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
});
t('escapeHtml: null/undefined → empty string (no "null" leak)', () => {
  assert(escapeHtml(null) === '');
  assert(escapeHtml(undefined) === '');
});
t('escapeHtml: a crafted doc title cannot break out of an attribute or inject markup', () => {
  const title = '"><img src=x onerror=alert(1)>';
  const out = escapeHtml(title);
  assert(!out.includes('<img'), 'tag not neutralized');
  assert(!out.includes('">'), 'attribute break not neutralized');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
