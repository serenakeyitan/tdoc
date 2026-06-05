// CLI resilience tests (Batch D). Drives the real bash scripts in a hermetic
// temp TDOC_DIR. Node test runner so it joins the same `npm test` suite.
//
// Covers:
//   - tdoc-new-force-destroys-before-validate (P2): --force must NOT destroy an
//     existing doc when the replacement HTML is invalid (stage-validate-swap)
//   - cli-curl-no-timeout (P2): every curl carries --max-time (static check)
//   - cli-cf-api-no-http-status-check (P2): cf_api helper exists + gates status
//   - published.json validation, partial-version abort, ping-loop (static)
//
// Run with: node test/cli.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

let pass = 0, fail = 0;
function ok(n) { console.log(`  ✓ ${n}`); pass++; }
function bad(n, e) { console.log(`  ✗ ${n}\n    ${e}`); fail++; }
function t(n, fn) { try { fn(); ok(n); } catch (e) { bad(n, e.message); } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

const BIN = path.join(__dirname, '..', 'bin');
const readBin = (f) => fs.readFileSync(path.join(BIN, f), 'utf8');

console.log('cli (Batch D resilience)');

// ---- static checks across all CLIs ----
t('every curl call carries --max-time (no unbounded hang)', () => {
  for (const f of ['tdoc-publish', 'tdoc-pull', 'tdoc-doctor']) {
    const src = readBin(f);
    const curls = src.split('\n').filter(l => /\bcurl\b/.test(l) && !l.trim().startsWith('#'));
    for (const line of curls) {
      assert(/--max-time/.test(line), `${f}: curl without --max-time:\n      ${line.trim()}`);
    }
  }
});

t('tdoc-publish has a cf_api helper that checks HTTP status', () => {
  const src = readBin('tdoc-publish');
  assert(/cf_api\(\)/.test(src), 'cf_api helper missing');
  assert(/http_code/.test(src) && /grep -qE '\^2/.test(src), 'cf_api does not gate on 2xx HTTP status');
});

t('tdoc-publish validates published.json fields (no null host/token)', () => {
  const src = readBin('tdoc-publish');
  assert(/= "null"/.test(src) && /Delete it and re-run/.test(src),
    'published.json null-field validation missing');
});

t('tdoc-publish does not let an older-version failure abort the latest', () => {
  const src = readBin('tdoc-publish');
  assert(/OLDER_FAILED/.test(src), 'older-version best-effort handling missing');
  assert(/FATAL: latest version/.test(src), 'latest-version hard-fail missing');
});

t('tdoc-new fails loudly if the local server never comes up', () => {
  const src = readBin('tdoc-new');
  assert(/SERVER_UP/.test(src) && /failed to start/.test(src),
    'ping-loop success is not checked');
});

// ---- live behavior: --force must not destroy an existing doc on bad input ----
t('tdoc-new --force preserves the existing doc when new HTML is INVALID [the bug]', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdoc-cli-'));
  try {
    const env = { ...process.env, TDOC_DIR: dir, TDOC_PORT: '0' };
    // seed an existing doc with a real comment we must not lose
    const docDir = path.join(dir, 'mydoc');
    fs.mkdirSync(path.join(docDir, 'v1'), { recursive: true });
    fs.writeFileSync(path.join(docDir, 'v1', 'index.html'), '<!doctype html><body>ORIGINAL</body>');
    fs.writeFileSync(path.join(docDir, 'meta.json'), JSON.stringify({ slug: 'mydoc', versions: [{ n: 1 }] }));
    fs.writeFileSync(path.join(docDir, 'comments.json'), JSON.stringify([{ id: 'c1', text: 'precious' }]));

    // run --force with MARKDOWN (no <body>) on stdin → must be rejected
    const r = spawnSync(path.join(BIN, 'tdoc-new'),
      ['--slug', 'mydoc', '--title', 'x', '--html-stdin', '--force'],
      { input: '# just markdown, no body tag', env, encoding: 'utf8', timeout: 20000 });

    assert(r.status !== 0, 'tdoc-new should have FAILED on markdown input');
    // the original doc + comment must still be intact
    const html = fs.readFileSync(path.join(docDir, 'v1', 'index.html'), 'utf8');
    assert(/ORIGINAL/.test(html), 'original HTML was destroyed by --force on invalid input!');
    const comments = JSON.parse(fs.readFileSync(path.join(docDir, 'comments.json'), 'utf8'));
    assert(comments[0] && comments[0].text === 'precious', 'comments were destroyed!');
    // and no stray stage dirs left behind
    const stray = fs.readdirSync(dir).filter(n => n.startsWith('.stage-'));
    assert(stray.length === 0, `stage dir not cleaned up: ${stray}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
