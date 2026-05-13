// API integration test against the local server.
// Run with: node test/api.test.js
// Assumes server is reachable at localhost:7878.

const http = require('http');

const HOST = process.env.TDOC_HOST || 'localhost';
const PORT = process.env.TDOC_PORT || 7878;
const SLUG = 'api-test-' + Date.now();

let pass = 0, fail = 0;
function ok(name) { console.log(`  ✓ ${name}`); pass++; }
function bad(name, err) { console.log(`  ✗ ${name}\n    ${err}`); fail++; }
async function t(name, fn) { try { await fn(); ok(name); } catch (e) { bad(name, e.message); } }

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      host: HOST, port: PORT, path, method,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    }, (res) => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf || '{}') }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  console.log(`testing local API at ${HOST}:${PORT}\n`);

  // Seed: create a doc directory + meta + empty comments
  const docDir = path.join(os.homedir(), 'tdocs', SLUG);
  fs.mkdirSync(path.join(docDir, 'v1'), { recursive: true });
  fs.writeFileSync(path.join(docDir, 'v1', 'index.html'), '<h1>api test</h1>');
  fs.writeFileSync(path.join(docDir, 'meta.json'), JSON.stringify({ title: 'api test', versions: [{ n: 1 }] }));
  fs.writeFileSync(path.join(docDir, 'comments.json'), '[]');

  let topId;
  let replyId;

  await t('POST /api/comments (top-level) returns 200 with id + replies:[] + reactions:{}', async () => {
    const r = await req('POST', '/api/comments', { slug: SLUG, version: 1, text: 'hello', anchor: null });
    if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.body)}`);
    if (!r.body.id) throw new Error('no id');
    if (!Array.isArray(r.body.replies)) throw new Error('replies not array');
    if (typeof r.body.reactions !== 'object') throw new Error('reactions not object');
    topId = r.body.id;
  });

  await t('POST /api/comments with parent_id creates a reply', async () => {
    const r = await req('POST', '/api/comments', { slug: SLUG, parent_id: topId, text: 'a reply' });
    if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.body)}`);
    if (!r.body.id || !r.body.id.startsWith('r_')) throw new Error(`reply id should start with r_, got ${r.body.id}`);
    replyId = r.body.id;
  });

  await t('GET /api/comments returns the top comment with reply nested in .replies', async () => {
    const r = await req('GET', `/api/comments?slug=${SLUG}`);
    const list = r.body;
    if (!Array.isArray(list) || list.length !== 1) throw new Error(`expected 1 top, got ${list?.length}`);
    if (!Array.isArray(list[0].replies) || list[0].replies.length !== 1) throw new Error('reply not nested');
    if (list[0].replies[0].id !== replyId) throw new Error('reply id mismatch');
  });

  await t('POST /api/reactions adds 👍 to top comment', async () => {
    const r = await req('POST', '/api/reactions', { slug: SLUG, comment_id: topId, emoji: '👍' });
    if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.body)}`);
    if (!r.body.reactions['👍']) throw new Error('reaction not stored');
  });

  await t('POST /api/reactions same emoji again removes it (toggle)', async () => {
    const r = await req('POST', '/api/reactions', { slug: SLUG, comment_id: topId, emoji: '👍' });
    if (r.body.reactions['👍']) throw new Error('reaction not removed on second toggle');
  });

  await t('POST /api/reactions on a reply works', async () => {
    const r = await req('POST', '/api/reactions', { slug: SLUG, comment_id: replyId, emoji: '🔥' });
    if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.body)}`);
    if (!r.body.reactions['🔥']) throw new Error('reaction not stored on reply');
  });

  await t('DELETE /api/comments?id=<reply-id> removes the reply, leaves top', async () => {
    const r = await req('DELETE', `/api/comments?slug=${SLUG}&id=${replyId}`);
    if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.body)}`);
    const after = await req('GET', `/api/comments?slug=${SLUG}`);
    if (after.body.length !== 1) throw new Error('top comment was removed');
    if (after.body[0].replies.length !== 0) throw new Error('reply not removed');
  });

  await t('DELETE /api/comments?id=<top-id> removes the top comment', async () => {
    const r = await req('DELETE', `/api/comments?slug=${SLUG}&id=${topId}`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const after = await req('GET', `/api/comments?slug=${SLUG}`);
    if (after.body.length !== 0) throw new Error('top comment not removed');
  });

  // Cleanup
  try { fs.rmSync(docDir, { recursive: true, force: true }); } catch {}

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
})();
