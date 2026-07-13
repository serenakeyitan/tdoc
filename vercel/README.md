# tdoc on Vercel

This directory is the **deploy template** for publishing tdoc to Vercel
instead of a Cloudflare Worker. You normally never touch it directly —
`tdoc-publish --platform vercel <slug>` copies it to `~/.tdoc/vercel-app/`,
bundles the worker into it, and drives the `vercel` CLI. Everything below is
for people who want to understand or debug that flow.

## Architecture

The **same** worker code (`worker/worker.js` + `server/overlay.js`, bundled to
`_worker.bundled.js` at publish time) runs behind a single catch-all Vercel
function. Only the storage bindings differ:

| Cloudflare binding | Vercel backend | Shim |
|---|---|---|
| `DOCS` (R2 bucket) | Vercel Blob | `lib/blob-r2.js` |
| `META` (KV namespace) | Upstash Redis (Marketplace) / legacy Vercel KV | `lib/upstash-kv.js` |
| `COMMENTS` (Durable Object) | *absent* | worker's built-in KV fallback |

`vercel.json` rewrites every path to `/api/tdoc`, and `lib/request-url.js`
reconstructs the original URL so the worker's own router sees the real path
(`/d/<slug>/v/<N>`, `/api/upload`, …).

## One-time setup (what tdoc-publish automates)

1. `npm i -g vercel` and `vercel login`.
2. `vercel link` a project (default name `tdoc`).
3. In the Vercel dashboard → project → **Storage**:
   - create a **Blob** store and connect it (provides `BLOB_READ_WRITE_TOKEN`);
   - add an **Upstash Redis** store from the Marketplace and connect it
     (provides `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`; a legacy
     Vercel KV store's `KV_REST_API_*` vars work too).
4. Set the `TDOC_UPLOAD_TOKEN` env var (tdoc-publish generates it) and
   optionally `TDOC_OWNER` (your GitHub login, for the owner-only `/me`
   catalog).
5. `vercel deploy --prod` — but only after tdoc-publish has written
   `_worker.bundled.js`; deploying the raw template fails the build on
   purpose, because a worker without the inlined overlay is broken.

Both storage products have free tiers that comfortably cover personal use.

## Known differences vs. the Cloudflare deployment

- **No per-slug write serialization.** Cloudflare uses a Durable Object to
  serialize concurrent comment writes (#34). Vercel has no equivalent
  primitive here, so the worker uses its documented KV fallback: two people
  commenting on the same doc in the same instant can race (last write wins).
  Fine for personal/small-team use; heavy concurrent commenting is better
  served by the Cloudflare target.
- **Upload body limit ≈ 4.5 MB** (Vercel function request limit). Docs with
  large embedded images that publish fine to Cloudflare (100 MB limit) can
  exceed it.
- **Blob is public-by-URL.** Doc bytes live in a Vercel Blob store whose
  hostname contains a random store id. tdoc never emits blob URLs to clients
  (docs are served through the function, which is also where the overlay is
  injected), so docs remain link-only in practice — but unlike R2 there is no
  hard ACL on the underlying objects. Treat published docs as
  public-if-leaked, and don't publish secrets.
- **Blob CDN staleness ≤ 60 s** when overwriting an already-published version
  (fresh versions are unaffected).
