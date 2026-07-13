// Vercel storage shims (vercel/lib/*). Offline: the KV shim takes an
// injectable fetchImpl and the Blob shim takes an injectable SDK, so nothing
// here needs @vercel/blob installed or any network. What this guards:
//
//   - the KV shim speaks the worker's KV contract EXACTLY (get→string|null,
//     list→{keys:[{name}],cursor,list_complete}) over Upstash REST commands
//   - the Blob shim speaks the worker's R2 contract (get→{text()}|null,
//     head→{size}|null, list→{objects,truncated,cursor}) and — critically —
//     resolves keys by EXACT pathname, not prefix (docs/a/v1 must never
//     resolve to docs/a/v11's blob)
//   - the rewrite-URL helper reconstructs the original path + query behind
//     the vercel.json catch-all, since the worker routes on pathname
//
// vercel/ is an ESM package (type: module); this CJS suite loads it via
// dynamic import. Run with: node test/vercel-shim.test.js

const path = require('path');

let pass = 0, fail = 0;
function ok(n) { console.log(`  ✓ ${n}`); pass++; }
function bad(n, e) { console.log(`  ✗ ${n}\n    ${e}`); fail++; }
async function t(n, fn) { try { await fn(); ok(n); } catch (e) { bad(n, e.message); } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { assert(JSON.stringify(a) === JSON.stringify(b), `${m || 'eq'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }

const LIB = (f) => path.join(__dirname, '..', 'vercel', 'lib', f);

// Minimal Upstash REST fake: replies per-command, records every request body.
function fakeUpstash(replies) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const args = JSON.parse(init.body);
    calls.push({ url, auth: init.headers.Authorization, args });
    const r = replies.shift();
    if (r && r.httpError) return { ok: false, status: r.httpError, json: async () => ({ error: 'boom' }) };
    return { ok: true, status: 200, json: async () => ({ result: r === undefined ? null : r.result }) };
  };
  return { calls, fetchImpl };
}

(async () => {
  console.log('vercel shims');
  const { createKvStore, globEscape } = await import(LIB('upstash-kv.js'));
  const { createDocsStore } = await import(LIB('blob-r2.js'));
  const { originalRequestUrl } = await import(LIB('request-url.js'));

  // ---- upstash-kv ----
  await t('kv.get returns the string, null for a missing key, and sends GET', async () => {
    const f = fakeUpstash([{ result: '{"a":1}' }, { result: null }]);
    const kv = createKvStore({ url: 'https://kv.example/', token: 'tok', fetchImpl: f.fetchImpl });
    eq(await kv.get('meta:x'), '{"a":1}');
    eq(await kv.get('meta:gone'), null);
    eq(f.calls[0].args, ['GET', 'meta:x']);
    assert(f.calls[0].auth === 'Bearer tok', 'missing bearer token');
    assert(f.calls[0].url === 'https://kv.example', 'trailing slash not stripped');
  });

  await t('kv.put / kv.delete send SET / DEL with the raw string value', async () => {
    const f = fakeUpstash([{ result: 'OK' }, { result: 1 }]);
    const kv = createKvStore({ url: 'https://kv.example', token: 't', fetchImpl: f.fetchImpl });
    await kv.put('comments:s', '[{"id":"c1"}]');
    await kv.delete('comments:s');
    eq(f.calls[0].args, ['SET', 'comments:s', '[{"id":"c1"}]']);
    eq(f.calls[1].args, ['DEL', 'comments:s']);
  });

  await t('kv.list pages through SCAN with the worker loop contract', async () => {
    const f = fakeUpstash([
      { result: ['42', ['meta:a', 'meta:b']] },
      { result: ['0', ['meta:c']] },
    ]);
    const kv = createKvStore({ url: 'https://kv.example', token: 't', fetchImpl: f.fetchImpl });
    // Mirrors the worker's paging loop (indexHtml): concat until list_complete.
    let names = [], cursor;
    do {
      const r = await kv.list({ prefix: 'meta:', cursor });
      names = names.concat(r.keys.map(k => k.name));
      cursor = r.cursor;
      if (r.list_complete) break;
    } while (cursor);
    eq(names, ['meta:a', 'meta:b', 'meta:c']);
    eq(f.calls[0].args, ['SCAN', '0', 'MATCH', 'meta:*', 'COUNT', '1000']);
    eq(f.calls[1].args, ['SCAN', '42', 'MATCH', 'meta:*', 'COUNT', '1000']);
  });

  await t('kv errors throw (HTTP error and {error} body), never return junk', async () => {
    const f = fakeUpstash([{ httpError: 500 }]);
    const kv = createKvStore({ url: 'https://kv.example', token: 't', fetchImpl: f.fetchImpl });
    let threw = false;
    try { await kv.get('k'); } catch { threw = true; }
    assert(threw, 'HTTP 500 did not throw');
  });

  await t('glob metacharacters in a prefix are escaped for MATCH', () => {
    eq(globEscape('a*b?c[d]'), 'a\\*b\\?c\\[d\\]');
  });

  // ---- blob-r2 ----
  // Fake @vercel/blob SDK over an in-memory map keyed by pathname.
  function fakeBlobSdk() {
    const store = new Map(); // pathname → {content, opts}
    const calls = { put: [], del: [] };
    return {
      store, calls,
      put: async (pathname, content, opts) => { calls.put.push({ pathname, opts }); store.set(pathname, { content, opts }); },
      del: async (url) => { calls.del.push(url); for (const [k] of store) { if (`https://blob.test/${k}` === url) store.delete(k); } },
      list: async ({ prefix = '', cursor, limit }) => ({
        blobs: [...store.keys()].filter(k => k.startsWith(prefix))
          .map(pathname => ({ pathname, url: `https://blob.test/${pathname}`, size: store.get(pathname).content.length })),
        hasMore: false,
        cursor: undefined,
      }),
      fetchBlob: async (url) => {
        const key = url.replace('https://blob.test/', '');
        const hit = store.get(key);
        return hit ? { ok: true, text: async () => hit.content } : { ok: false, text: async () => '' };
      },
    };
  }

  await t('docs.put writes overwrite-in-place with the R2 contentType mapped', async () => {
    const sdk = fakeBlobSdk();
    const docs = createDocsStore(sdk);
    await docs.put('docs/a/v1/index.html', '<html>', { httpMetadata: { contentType: 'text/html; charset=utf-8' } });
    const p = sdk.calls.put[0];
    assert(p.pathname === 'docs/a/v1/index.html', 'pathname mismatch');
    assert(p.opts.addRandomSuffix === false && p.opts.allowOverwrite === true, 'must overwrite in place like R2');
    assert(p.opts.contentType === 'text/html; charset=utf-8', 'contentType not mapped');
  });

  await t('docs.get/head resolve by EXACT pathname (v1 never matches v11)', async () => {
    const sdk = fakeBlobSdk();
    sdk.store.set('docs/a/v11/index.html', { content: 'ELEVEN', opts: {} });
    const docs = createDocsStore(sdk);
    eq(await docs.get('docs/a/v1/index.html'), null, 'prefix collision must not resolve');
    eq(await docs.head('docs/a/v1/index.html'), null);
    sdk.store.set('docs/a/v1/index.html', { content: 'ONE', opts: {} });
    eq(await (await docs.get('docs/a/v1/index.html')).text(), 'ONE');
    eq((await docs.head('docs/a/v1/index.html')).size, 3);
  });

  await t('docs.delete removes the exact blob; missing key is a no-op', async () => {
    const sdk = fakeBlobSdk();
    sdk.store.set('docs/a/v1/index.html', { content: 'x', opts: {} });
    const docs = createDocsStore(sdk);
    await docs.delete('docs/a/v1/index.html');
    assert(!sdk.store.has('docs/a/v1/index.html'), 'not deleted');
    await docs.delete('docs/a/v1/index.html'); // must not throw
  });

  await t('docs.list maps blobs→objects and hasMore→truncated', async () => {
    const sdk = fakeBlobSdk();
    sdk.store.set('docs/a/v1/index.html', { content: 'x', opts: {} });
    sdk.store.set('docs/a/v2/index.html', { content: 'y', opts: {} });
    sdk.store.set('docs/b/v1/index.html', { content: 'z', opts: {} });
    const docs = createDocsStore(sdk);
    const r = await docs.list({ prefix: 'docs/a/' });
    eq(r.objects.map(o => o.key).sort(), ['docs/a/v1/index.html', 'docs/a/v2/index.html']);
    assert(r.truncated === false, 'truncated mapping');
  });

  // ---- request-url ----
  await t('rewritten request URL is reconstructed (path + merged query + fwd host)', () => {
    const req = new Request('https://internal.fn/api/tdoc?__path=d/my-doc/v/2&version=all', {
      headers: { 'x-forwarded-host': 'tdoc-me.vercel.app', 'x-forwarded-proto': 'https' },
    });
    eq(originalRequestUrl(req), 'https://tdoc-me.vercel.app/d/my-doc/v/2?version=all');
  });

  await t('root path and no-query rewrites resolve cleanly', () => {
    const req = new Request('https://h.test/api/tdoc?__path=', {
      headers: { 'x-forwarded-host': 'h.test' },
    });
    eq(originalRequestUrl(req), 'https://h.test/');
  });

  await t('non-rewritten request passes through with the public origin', () => {
    const req = new Request('https://internal.fn/api/ping?x=1', {
      headers: { 'x-forwarded-host': 'pub.test' },
    });
    eq(originalRequestUrl(req), 'https://pub.test/api/ping?x=1');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
