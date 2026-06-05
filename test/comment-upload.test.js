// Local-comment upload merge test (#11).
//
// tdoc-publish now sends local comments.json in the /api/upload payload, and the
// worker merges them NON-DESTRUCTIVELY: add a local comment only if its id is not
// already on the worker; never delete/overwrite worker-side comments; idempotent
// across republishes. This test pins those three safety properties against the
// worker's REAL fold helpers (so a regression in the shape handling is caught),
// by replaying the exact merge rule the upload handler uses.
//
// Run with: node test/comment-upload.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(n) { console.log(`  ✓ ${n}`); pass++; }
function bad(n, e) { console.log(`  ✗ ${n}\n    ${e}`); fail++; }
function t(n, fn) { try { fn(); ok(n); } catch (e) { bad(n, e.message); } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

// Load the worker's real fold/migrate helpers so the test exercises actual code.
const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'worker.js'), 'utf8');
function sliceFn(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`fn ${name} not found`);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } } }
  return src.slice(start, i);
}
function sliceConst(name) { return new RegExp(`const ${name} = \\[[\\s\\S]*?\\];`).exec(src)[0]; }

// Grab the whole comment-fold helper region in one go (from eventEid through
// historyList) so every transitive dependency is present — cherry-picking
// individual functions is brittle as the chain grows.
function sliceRegion(fromFn, toFnEndMarker) {
  const start = src.indexOf(`function ${fromFn}(`);
  if (start === -1) throw new Error(`region start ${fromFn} not found`);
  const endAnchor = src.indexOf(`function ${toFnEndMarker}(`);
  if (endAnchor === -1) throw new Error(`region end ${toFnEndMarker} not found`);
  // extend to the end of toFnEndMarker's body
  let i = src.indexOf('{', endAnchor), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } } }
  return src.slice(start, i);
}

const box = { AGENT_STATUS_EMOJI: { applied: '✅', partial: '🟡', question: '❓' } };
vm.createContext(box);
vm.runInContext([
  'cyrb53','aidFor',
].map(sliceFn).join('\n\n')
  + '\n\n' + sliceConst('STAMPABLE_TAGS')
  + '\n\n' + sliceFn('isFiniteVersion')
  // legacyToEvents(486) … compactComments(800) spans every fold/migrate helper
  // in definition order (ensureEventLog, snapshotAt, ensureMigrated, eventEid,
  // backfillEids, dedupEvents, …). Function hoisting handles forward refs.
  + '\n\n' + sliceRegion('legacyToEvents', 'compactComments'), box);

// Replicate the upload handler's merge rule EXACTLY (add-by-id-if-absent).
function mergeUpload(workerList, localComments) {
  const list = JSON.parse(JSON.stringify(workerList));
  let merged = 0;
  if (Array.isArray(localComments) && localComments.length) {
    const have = new Set(list.map(c => c && c.id).filter(Boolean));
    for (const lc of localComments) {
      if (!lc || !lc.id || have.has(lc.id)) continue;
      box.ensureEventLog(lc);
      list.push(lc);
      have.add(lc.id);
      merged++;
    }
  }
  if (list.length) box.ensureMigrated(list);
  return { list, merged };
}

const mkLocal = (id, text) => ({
  id, version: 1, anchor: { kind: 'text', text: 'anchor-' + id },
  text, author: { login: 'me', avatar_url: '', name: 'Me' },
  status: 'open', created: '2026-01-01T00:00:00Z', replies: [], reactions: {},
});

console.log('comment-upload merge (#11)');

t('adds a local comment the worker does not have', () => {
  const worker = [];
  const { list, merged } = mergeUpload(worker, [mkLocal('c_local_1', 'hi')]);
  assert(merged === 1, `expected 1 merged, got ${merged}`);
  const ids = box.historyList(list).map(c => c.id);
  assert(ids.includes('c_local_1'), 'local comment not present after merge');
});

t('NEVER overwrites a worker comment with the same id', () => {
  // worker already has c_x authored by someone else; local has a c_x too.
  const workerComment = mkLocal('c_x', 'WORKER ORIGINAL');
  box.ensureEventLog(workerComment);
  const worker = [workerComment];
  const local = [mkLocal('c_x', 'LOCAL OVERWRITE ATTEMPT')];
  const { list, merged } = mergeUpload(worker, local);
  assert(merged === 0, 'must not merge a colliding id');
  const snap = box.historyList(list).find(c => c.id === 'c_x');
  assert(/WORKER ORIGINAL/.test(snap.text), `worker comment was overwritten: "${snap.text}"`);
});

t('NEVER deletes worker comments absent from the local set', () => {
  const wc = mkLocal('c_worker_only', 'published by a reader');
  box.ensureEventLog(wc);
  const worker = [wc];
  const { list } = mergeUpload(worker, [mkLocal('c_local_new', 'from my laptop')]);
  const ids = box.historyList(list).map(c => c.id).sort();
  assert(ids.includes('c_worker_only'), 'worker-only comment was dropped!');
  assert(ids.includes('c_local_new'), 'new local comment missing');
});

t('is idempotent — re-merging the same local set adds nothing', () => {
  const local = [mkLocal('c_a', 'a'), mkLocal('c_b', 'b')];
  const first = mergeUpload([], local);
  const second = mergeUpload(first.list, local);
  assert(second.merged === 0, `second merge added ${second.merged} (should be 0)`);
  assert(box.historyList(second.list).length === 2, 'idempotency broke comment count');
});

t('mirror of pull: local↔worker round-trip converges (no dupes, no loss)', () => {
  const worker = [(() => { const c = mkLocal('c_pub', 'public'); box.ensureEventLog(c); return c; })()];
  const local = [mkLocal('c_pub', 'stale local copy'), mkLocal('c_mine', 'only local')];
  const { list } = mergeUpload(worker, local);
  const ids = box.historyList(list).map(c => c.id).sort();
  assert(JSON.stringify(ids) === JSON.stringify(['c_mine', 'c_pub']), `converged set wrong: ${ids}`);
  // and the public one kept the WORKER text, not the stale local one
  const pub = box.historyList(list).find(c => c.id === 'c_pub');
  assert(/public/.test(pub.text), 'worker copy lost to stale local on round-trip');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
