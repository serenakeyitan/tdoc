// META (Cloudflare KV) shim over an Upstash Redis REST endpoint — the storage
// Vercel's Marketplace provisions as its KV offering. The worker only uses
// four KV operations (get / put / delete / list-by-prefix), so we implement
// exactly that surface and nothing more.
//
// Raw REST (fetch) instead of @upstash/redis on purpose: the repo ships zero
// runtime npm dependencies, the REST protocol is documented + stable
// (https://upstash.com/docs/redis/features/restapi), and an injectable
// `fetchImpl` keeps this testable offline with no SDK installed.
//
// Consistency note: Upstash REST reads hit the primary, so the worker's
// read-after-write flows (device-flow login writes a session then the client
// immediately uses the cookie; posting a comment then refetching the list)
// behave the same as Cloudflare KV.

// Escape Redis glob metacharacters so a literal prefix like "meta:" can't be
// misread as a pattern. Prefixes we pass are [a-z:-] today; this is defense
// against a future key charset change, not a live bug.
function globEscape(s) {
  return String(s).replace(/[\\*?[\]]/g, '\\$&');
}

function createKvStore({ url, token, fetchImpl }) {
  if (!url || !token) throw new Error('upstash-kv: url and token are required');
  const doFetch = fetchImpl || fetch;
  const base = url.replace(/\/+$/, '');

  // One Redis command per call, pipelining not needed at tdoc's volume.
  // Non-2xx or an {error} body throws — the worker's endpoints already turn
  // storage throws into 500s with a logged message, matching R2/KV behavior.
  async function cmd(...args) {
    const r = await doFetch(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args.map(String)),
    });
    let body;
    try { body = await r.json(); } catch { body = {}; }
    if (!r.ok || body.error) {
      throw new Error(`upstash ${args[0]} failed: ${body.error || `HTTP ${r.status}`}`);
    }
    return body.result;
  }

  return {
    // KV.get(key) → string | null. Upstash returns null for a missing key.
    async get(key) {
      const v = await cmd('GET', key);
      return v == null ? null : String(v);
    },
    // KV.put(key, value). The worker only ever writes strings (JSON).
    async put(key, value) {
      await cmd('SET', key, value);
    },
    // KV.delete(key). Deleting a missing key is a no-op, same as KV.
    async delete(key) {
      await cmd('DEL', key);
    },
    // KV.list({prefix, cursor}) → { keys: [{name}], cursor, list_complete }.
    // SCAN's contract matches the worker's paging loop exactly: it may return
    // an empty page with a non-zero cursor (worker keeps looping) and signals
    // completion with cursor "0" (worker breaks on list_complete).
    async list({ prefix = '', cursor } = {}) {
      const res = await cmd('SCAN', cursor || '0', 'MATCH', `${globEscape(prefix)}*`, 'COUNT', '1000');
      const next = String(res[0]);
      const names = Array.isArray(res[1]) ? res[1] : [];
      return {
        keys: names.map(name => ({ name })),
        cursor: next === '0' ? undefined : next,
        list_complete: next === '0',
      };
    },
  };
}

export { createKvStore, globEscape };
