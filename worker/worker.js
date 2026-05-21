// tdoc Cloudflare Worker — published view + GitHub Device Flow auth.
//
// Bindings (wrangler.toml):
//   DOCS   — R2 bucket (key: docs/<slug>/v<N>/index.html)
//   META   — KV namespace
// Vars:
//   GITHUB_CLIENT_ID — hardcoded "Ov23liZ1UAGOchvKPmlS"
// Secrets:
//   TDOC_UPLOAD_TOKEN — shared secret for /api/upload from `tdoc publish`
//
// IMPORTANT: This file contains a placeholder string `__TDOC_OVERLAY_JS__`.
// The publish script reads server/overlay.js and replaces that placeholder
// inline before deploy, producing worker/_worker.bundled.js. Do not deploy
// worker.js directly — the overlay would be missing.

const OVERLAY_JS = `__TDOC_OVERLAY_JS__`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(obj, init = {}) {
  return new Response(JSON.stringify(obj), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json', ...CORS, ...(init.headers || {}) },
  });
}
function text(body, init = {}) {
  return new Response(body, {
    status: init.status || 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...(init.headers || {}) },
  });
}
function html(body, init = {}) {
  return new Response(body, {
    status: init.status || 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...(init.headers || {}) },
  });
}

function parseCookie(req) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(/tdoc_sid=([a-f0-9]+)/);
  return m ? m[1] : null;
}
async function getSession(env, req) {
  const sid = parseCookie(req);
  if (!sid) return null;
  const raw = await env.META.get(`session:${sid}`);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return { id: sid, ...data };
  } catch { return null; }
}
// The worker owner = the GitHub login configured in TDOC_OWNER at deploy.
// Only that signed-in viewer may see the catalog of hosted docs. Case-
// insensitive; if TDOC_OWNER is unset, nobody is owner (catalog stays
// fully private — safe default).
function isOwnerSession(env, session) {
  const owner = (env.TDOC_OWNER || '').trim().toLowerCase();
  if (!owner || !session || !session.login) return false;
  return session.login.toLowerCase() === owner;
}
function rand(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Escape `</script>` and HTML comment terminators so a malicious or stray value
// inside the JSON payload can't break out of the surrounding <script> block.
function safeJsonForScript(obj) {
  return JSON.stringify(obj).replace(/<\/script>/gi, '<\\/script>').replace(/<!--/g, '<\\!--');
}

// ─────────────────────────────────────────────────────────────────────────
// Artifact identity (`data-tdoc-aid`)
//
// THE PROBLEM: positional CSS selectors silently drift when /tdoc edit
// restructures HTML. A comment anchored to `div > svg:nth-of-type(1)` will
// resolve to a different artifact in the next version with no indication.
//
// THE FIX: at upload time, the worker stamps every commentable artifact in
// the published HTML with `data-tdoc-aid="<content-hash>"`. The hash is
// derived from the artifact's TAG + NORMALIZED INNER CONTENT (whitespace
// collapsed, existing data-tdoc-* attrs stripped so the hash doesn't
// include itself). The SAME ARTIFACT IN A DIFFERENT VERSION HAS THE SAME
// AID. Comments anchor by aid; resolution is identity-first; drift is
// impossible because the aid is the artifact, not a path through the DOM.
//
// The set of commentable artifacts matches the overlay's COMMENTABLE.
// Includes leaf media + semantic blocks the author signaled are a unit.
// Plus: any element with `data-tdoc-artifact` or a class containing
// `tdoc-artifact` is stamped regardless of tag (the explicit opt-in path).
// NOTE: `article` is intentionally omitted — it's the doc CONTENT ROOT
// in some authoring patterns (per ARTICLE_ROOT_SEL in overlay.js); making
// it commentable would make the whole doc one big artifact. Use `section`
// or `data-tdoc-artifact` to mark sub-blocks instead.
const STAMPABLE_TAGS = [
  'img','svg','canvas','video','pre','figure','iframe',
  'section','aside','blockquote','table','details',
];
// 53-bit string hash (public-domain cyrb53), identical to the one in the
// overlay so identities computed on either side agree.
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
// Compute an aid from a raw HTML substring representing one artifact element.
// Strips data-tdoc-* attrs from the open tag (so an aid doesn't include
// itself), strips comments, collapses whitespace inside.
function aidFor(tag, innerHtml, openAttrs) {
  // Keep author-meaningful intrinsics (viewBox / src / alt / aria-label /
  // title) as part of identity — they're what makes a `<svg>` *this* svg.
  const intrinsics = ['viewBox','src','alt','aria-label','title']
    .map(a => {
      const m = new RegExp('\\b' + a + '\\s*=\\s*"([^"]*)"', 'i').exec(openAttrs || '');
      return m ? a + '=' + m[1] : '';
    })
    .filter(Boolean).join('|');
  const norm = (innerHtml || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\sdata-tdoc-[\w-]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cyrb53(tag + '|' + intrinsics + '|' + norm);
}
// Walk the HTML and stamp `data-tdoc-aid` on every commentable element.
// Returns { html: <stamped>, aids: [{aid, tag, head, heading}] }.
//
// Two-pass design — the previous one-pass version was wrong: when an outer
// commentable (e.g. <figure>) contains an inner one (e.g. <svg>), naive
// regex walking skipped past the inner element's close tag. We now run
// SEPARATE passes per tag, so an svg inside a figure gets stamped just
// like a free-standing svg. Both are valid anchor targets.
function stampAids(rawHtml) {
  const headRe = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headings = [];
  let hmatch;
  while ((hmatch = headRe.exec(rawHtml))) {
    headings.push({ end: hmatch.index + hmatch[0].length,
      text: hmatch[2].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim() });
  }
  function nearestHeadingAt(idx) {
    let best = null;
    // Use <= so a heading whose close tag ends exactly at the next
    // element's open (no whitespace between) is still "before" it.
    for (const h of headings) { if (h.end <= idx) best = h.text; else break; }
    return best;
  }
  // Find every open tag of every stampable kind in document order.
  // For non-void tags, find its matching close (same-tag depth count).
  // Collect [openStart, openEnd, closeEnd, tag, attrs, innerHtml] per element.
  const elements = [];
  const seenOpens = new Set();   // dedupe across passes (tag pass + opt-in pass)
  function harvest(openStart, openEnd, tagLower, attrs) {
    if (seenOpens.has(openStart)) return;
    const isVoid = /^(img|iframe)$/i.test(tagLower) || /\/\s*$/.test(attrs);
    let closeEnd = openEnd, innerHtml = '';
    if (!isVoid) {
      const closeRe = new RegExp(`</${tagLower}\\s*>|<${tagLower}\\b[^>]*>`, 'gi');
      closeRe.lastIndex = openEnd;
      let depth = 1, c;
      while ((c = closeRe.exec(rawHtml))) {
        if (c[0][1] === '/') { depth--; if (depth === 0) { closeEnd = c.index + c[0].length; break; } }
        else depth++;
      }
      innerHtml = rawHtml.slice(openEnd, closeEnd - (`</${tagLower}>`.length));
    }
    seenOpens.add(openStart);
    elements.push({ openStart, openEnd, closeEnd, tag: tagLower, attrs, innerHtml, isVoid });
  }
  // Pass 1: every known stampable tag.
  for (const tag of STAMPABLE_TAGS) {
    const openRe = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
    let m;
    while ((m = openRe.exec(rawHtml))) harvest(m.index, m.index + m[0].length, tag, m[1] || '');
  }
  // Pass 2: opt-in markers (any tag with data-tdoc-artifact or class
  // containing `tdoc-artifact`). Authors mark composed cards/widgets this
  // way so they're commentable as a unit.
  const optInRe = /<([a-z][\w-]*)\b([^>]*\b(?:data-tdoc-artifact\b|class\s*=\s*"[^"]*\btdoc-artifact\b[^"]*")[^>]*)>/gi;
  let om;
  while ((om = optInRe.exec(rawHtml))) {
    const tagLower = om[1].toLowerCase();
    harvest(om.index, om.index + om[0].length, tagLower, om[2] || '');
  }
  // Compute aid per element (uses cleaned attrs + inner content with any
  // existing data-tdoc-aid stripped, so re-stamping is idempotent).
  const aids = [];
  for (const e of elements) {
    const cleanedAttrs = e.attrs.replace(/\s+data-tdoc-aid\s*=\s*"[^"]*"/gi, '');
    // For nested commentables we hash the OUTER's content even though it
    // contains an inner commentable — that's correct, "outer artifact" is
    // a different identity than "inner artifact". We just strip any
    // data-tdoc-aid attributes from the inner before hashing so the
    // hash is stable across re-stampings.
    const cleanedInner = e.innerHtml.replace(/\sdata-tdoc-aid\s*=\s*"[^"]*"/gi, '');
    e._cleanedAttrs = cleanedAttrs;
    e._aid = aidFor(e.tag, cleanedInner, cleanedAttrs);
    aids.push({
      aid: e._aid, tag: e.tag,
      head: e.innerHtml.slice(0, 80),
      heading: nearestHeadingAt(e.openStart),
    });
  }
  // Apply stamps in REVERSE order so earlier offsets stay valid as we mutate.
  elements.sort((a, b) => b.openStart - a.openStart);
  let out = rawHtml;
  for (const e of elements) {
    const stampedOpen = e.isVoid
      ? `<${e.tag}${e._cleanedAttrs} data-tdoc-aid="${e._aid}"${/\/\s*$/.test(e.attrs) ? '/' : ''}>`
      : `<${e.tag}${e._cleanedAttrs} data-tdoc-aid="${e._aid}">`;
    out = out.slice(0, e.openStart) + stampedOpen + out.slice(e.openEnd);
  }
  return { html: out, aids };
}

// Reconcile open comment anchors against the freshly-stamped artifact set.
// Mutates `comments` in-place (returns it). Behavior:
//   • If the comment's anchor already targets a known aid (either stored
//     in `anchor.aid` or the selector is `[data-tdoc-aid="..."]`), it's
//     authoritative — leave it.
//   • If the comment has a `fingerprint` that matches one aid by content,
//     stamp `anchor.aid = <that aid>` so future resolution is identity-first.
//   • Otherwise (legacy positional selector + no fingerprint), try a
//     best-effort backfill: tag must match and the nearestHeading hint (if
//     present) must match too. Single high-confidence candidate → adopt;
//     ambiguous or missing → mark `anchor.kind = "lost"` so the comment
//     renders unanchored INSTEAD OF SILENTLY POINTING AT THE WRONG ARTIFACT.
function reconcileAnchors(comments, aidsInVersion) {
  if (!Array.isArray(comments)) return comments;
  const byAid = new Map(aidsInVersion.map(a => [a.aid, a]));
  for (const c of comments) {
    if (!c || !c.anchor) continue;
    // `lost` is a per-version verdict, not permanent. Re-evaluate on each
    // publish so an artifact restored or re-stamped in a later version
    // can rebind a previously-lost comment.
    if (c.anchor.kind === 'lost') { c.anchor.kind = 'element'; delete c.anchor.reason; }
    if (c.anchor.kind !== 'element') continue;
    // NB: previously we skipped `status:"applied"` here on the theory that
    // resolved comments don't re-anchor. But applied comments are STILL
    // rendered on the page (with their ✅ verdict) — and they still need
    // to point at the right artifact. A legacy applied comment with an
    // un-bound positional selector will display on the WRONG artifact
    // forever otherwise. So we reconcile applied comments too: bind their
    // aid if we can identify the artifact unambiguously; mark lost if not.
    const a = c.anchor;
    // 1. Already aid-anchored → trust it if the aid is still in the doc.
    //    If the aid is STALE (from a prior version), clear it and fall
    //    through to the heading/tag-based re-resolution — we may still be
    //    able to identify the artifact the user meant, and "stale aid"
    //    should never lock a comment to "lost" forever.
    const knownAid = a.aid
      || (a.selector && /\[data-tdoc-aid="([\w]+)"\]/.exec(a.selector || '')?.[1]);
    if (knownAid) {
      if (byAid.has(knownAid)) continue;       // valid → done
      // Stale aid: clear it and let the heading/tag matcher try again.
      delete a.aid;
      a.kind = 'element';                       // un-lose so we can retry
      delete a.reason;
    }
    // 2. Has a fingerprint — find the aid whose inventory matches the
    //    artifact tag + heading hint best.
    const fp = a.fingerprint;
    const wantTag = (fp && fp.tag) || (a.label || '').toLowerCase();
    const wantHead = a.fallback && a.fallback.nearestHeading && a.fallback.nearestHeading.text;
    const candidates = aidsInVersion.filter(x =>
      (!wantTag || x.tag === wantTag) &&
      (!wantHead || (x.heading || '').toLowerCase() === wantHead.toLowerCase())
    );
    if (candidates.length === 1) {
      a.aid = candidates[0].aid;
      continue;
    }
    if (candidates.length === 0) {
      // Try tag-only — if still ambiguous, give up cleanly.
      const tagOnly = aidsInVersion.filter(x => !wantTag || x.tag === wantTag);
      if (tagOnly.length === 1) { a.aid = tagOnly[0].aid; continue; }
      a.kind = 'lost'; a.reason = 'no candidate artifact in new version';
      continue;
    }
    // Ambiguous → unanchor rather than guess. The user can re-anchor.
    a.kind = 'lost'; a.reason = 'multiple candidate artifacts; cannot disambiguate';
  }
  return comments;
}

function injectOverlay(rawHtml, slug, version, identity, versions, isOwner) {
  const cfg = {
    slug, version,
    identity: identity || null,
    isOwner: !!isOwner,
    authConfigured: true,
    mode: 'published',
    versions: Array.isArray(versions) && versions.length ? versions : [{ n: version }],
  };
  const inject =
    `<script>window.__TDOC__ = ${safeJsonForScript(cfg)};</script>\n` +
    `<script>${OVERLAY_JS}</script>`;
  if (rawHtml.includes('</body>')) return rawHtml.replace('</body>', `${inject}\n</body>`);
  return rawHtml + inject;
}

// Neutral landing page served at `/`. No catalog, no slug list — just
// brand + a link to the open-source project. Docs are link-only.
function landingHtml() {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tdoc</title>
<style>
  body { font: 15px system-ui, -apple-system, sans-serif; min-height: 100vh;
    margin: 0; display: flex; flex-direction: column; align-items: center;
    justify-content: center; color: #111; background: #fff; gap: 10px; }
  h1 { font-size: 30px; margin: 0; color: #1652f0; }
  p { color: #666; margin: 0; }
  a { color: #1652f0; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .sub { margin-top: 14px; font-size: 13px; color: #888; }
</style></head><body>
  <h1>tdoc</h1>
  <p>Prompt-native, commentable documents.</p>
  <p class="sub">Open a document from its shared link ·
    <a href="https://github.com/serenakeyitan/tdoc">github.com/serenakeyitan/tdoc</a></p>
</body></html>`;
}

async function indexHtml(env, session) {
  // List all `meta:` keys.
  let list = [];
  let cursor;
  do {
    const r = await env.META.list({ prefix: 'meta:', cursor });
    list = list.concat(r.keys);
    cursor = r.cursor;
    if (r.list_complete) break;
  } while (cursor);

  const rows = [];
  for (const k of list) {
    const slug = k.name.slice('meta:'.length);
    const metaRaw = await env.META.get(k.name);
    let meta = {};
    try { meta = JSON.parse(metaRaw || '{}'); } catch {}
    const latest = meta.versions?.[meta.versions.length - 1]?.n || 1;
    // Only list docs whose latest version actually exists in R2 — otherwise
    // the index advertises 404s. (We hit this when R2 writes silently failed
    // while KV meta updates succeeded; defense in depth.)
    const exists = await env.DOCS.head(`docs/${slug}/v${latest}/index.html`);
    if (!exists) continue;
    rows.push(`<tr>
      <td><a href="/d/${slug}/v/${latest}">${(meta.title || slug).replace(/</g, '&lt;')}</a></td>
      <td>${slug}</td>
      <td>v${latest}</td>
    </tr>`);
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>tdoc</title>
<style>
  body { font: 15px system-ui, -apple-system, sans-serif; max-width: 760px; margin: 60px auto; padding: 0 20px; color: #111; }
  h1 { font-size: 28px; margin: 0 0 4px; color: #1652f0; }
  .sub { color: #666; margin: 0 0 32px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #eee; }
  th { font-size: 12px; text-transform: uppercase; color: #888; letter-spacing: 0.04em; }
  a { color: #1652f0; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .empty { color: #888; padding: 40px 0; text-align: center; }
  .who { color: #888; font-size: 13px; margin: 0 0 32px; }
  .who b { color: #444; font-weight: 600; }
</style></head><body>
<h1>My docs</h1>
<p class="who">Documents hosted on this worker${session && session.login ? ` · signed in as <b>${String(session.login).replace(/</g, '&lt;')}</b>` : ''}.</p>
${rows.length === 0 ? '<p class="empty">No published docs yet.</p>' :
  `<table><thead><tr><th>Title</th><th>Slug</th><th>Version</th></tr></thead><tbody>${rows.join('')}</tbody></table>`}
</body></html>`;
}

// ---- GitHub helpers ----
// Replace tdoc-agent's reaction on a target with the emoji for the new
// status. See server.js setAgentReaction for the protocol. Kept inline
// here because the worker bundles separately and can't import from the
// local server.
const AGENT_STATUS_EMOJI = { applied: '✅', partial: '🟡', question: '❓' };
function setAgentReaction(target, status) {
  if (!target.reactions) target.reactions = {};
  for (const emoji of Object.keys(target.reactions)) {
    const users = target.reactions[emoji] || [];
    const idx = users.indexOf('tdoc-agent');
    if (idx >= 0) users.splice(idx, 1);
    if (users.length === 0) delete target.reactions[emoji];
    else target.reactions[emoji] = users;
  }
  const next = AGENT_STATUS_EMOJI[status];
  if (!next) return;
  const u = target.reactions[next] || [];
  if (!u.includes('tdoc-agent')) u.push('tdoc-agent');
  target.reactions[next] = u;
}

async function ghPost(path, formObj) {
  const body = new URLSearchParams(formObj).toString();
  const r = await fetch(`https://github.com${path}`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'tdoc-worker',
    },
    body,
  });
  const ct = r.headers.get('content-type') || '';
  const raw = await r.text();
  // GitHub sometimes returns form-encoded even with Accept: application/json
  // (notably the device-flow endpoints). Detect and parse both shapes.
  if (ct.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return { error: 'gh_parse', error_description: raw.slice(0, 200) }; }
  }
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [k, v] of params) out[k] = v;
  if (!Object.keys(out).length) return { error: 'gh_empty', error_description: `status=${r.status} ct=${ct}` };
  return out;
}
async function ghUser(token) {
  const r = await fetch('https://api.github.com/user', {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'tdoc-worker',
    },
  });
  return r.json();
}

function requireUploadAuth(req, env) {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/);
  if (!m || !env.TDOC_UPLOAD_TOKEN || m[1] !== env.TDOC_UPLOAD_TOKEN) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    const method = req.method;

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (p === '/api/ping') return json({ ok: true });

    // ---- landing (NO public catalog) ----
    // `/` never lists docs. Docs are only reachable via their direct link.
    // A neutral branded page points at the open-source project.
    if (p === '/' && method === 'GET') return html(landingHtml());

    // ---- owner-only doc catalog ----
    // `/me` returns the list of every doc hosted on THIS worker, but only
    // to the configured owner (TDOC_OWNER) when signed in. Everyone else
    // gets redirected to the GitHub repo — no slug enumeration.
    if (p === '/me' && method === 'GET') {
      const s = await getSession(env, req);
      if (!isOwnerSession(env, s)) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://github.com/serenakeyitan/tdoc' },
        });
      }
      return html(await indexHtml(env, s));
    }

    // ---- doc view ----
    const docMatch = p.match(/^\/d\/([^/]+)\/v\/(\d+)\/?$/);
    if (docMatch && (method === 'GET' || method === 'HEAD')) {
      const [, slug, vStr] = docMatch;
      const obj = await env.DOCS.get(`docs/${slug}/v${vStr}/index.html`);
      if (!obj) return text(`Not found: ${slug} v${vStr}`, { status: 404 });
      const raw = await obj.text();
      const session = await getSession(env, req);
      const identity = session ? { login: session.login, avatar_url: session.avatar_url, name: session.name } : null;
      // Pull the full versions array from meta so the bar can render a
      // version picker. Falls back to single-version if meta is missing.
      let versions = null;
      try {
        const metaRaw = await env.META.get(`meta:${slug}`);
        if (metaRaw) {
          const meta = JSON.parse(metaRaw);
          if (Array.isArray(meta.versions)) versions = meta.versions.map(v => ({ n: v.n, created: v.created || null }));
        }
      } catch {}
      return html(injectOverlay(raw, slug, Number(vStr), identity, versions, isOwnerSession(env, session)));
    }

    // ---- doc export / fork ----
    // /export → forces a file download (Content-Disposition: attachment) unless
    //           ?download=0. Used for "save a copy" links.
    // /fork   → returns the SAME bundled HTML but boots the overlay in
    //           mode:"fork" (read-only renderable view with comments mirrored
    //           from the embedded JSON). No /api calls, no auth, no publish.
    //
    // Both routes return:
    //   1. A leading agent-readable banner (HTML comment) listing every
    //      comment + reply + reaction grouped by anchor.
    //   2. A <script type="application/json" id="tdoc-fork-comments"> block
    //      with the full comments JSON (so agents can parse it reliably).
    //   3. Inline <!--TDOC-COMMENT id--> markers wrapped around each comment's
    //      anchor text so agents can locate the right region for "apply this
    //      comment" requests.
    const exportMatch = p.match(/^\/d\/([^/]+)\/v\/(\d+)\/(export|fork)\/?$/);
    if (exportMatch && method === 'GET') {
      const [, slug, vStr, kind] = exportMatch;
      const obj = await env.DOCS.get(`docs/${slug}/v${vStr}/index.html`);
      if (!obj) return text(`Not found: ${slug} v${vStr}`, { status: 404 });
      let html = await obj.text();

      const commentsRaw = await env.META.get(`comments:${slug}`);
      const comments = commentsRaw ? JSON.parse(commentsRaw) : [];
      const openComments = comments.filter(c => c.status !== 'resolved');

      // 1. Build the agent-readable banner.
      const reactionsText = (rs) => {
        if (!rs) return '';
        const parts = Object.entries(rs).filter(([, u]) => u && u.length > 0)
          .map(([e, u]) => `${e} (${u.length})`);
        return parts.length ? `    reactions: ${parts.join(', ')}\n` : '';
      };
      let banner = `<!--
  ===== tdoc fork export =====
  slug: ${slug}
  version: ${vStr}
  exported: ${new Date().toISOString()}

  ## How to use this file
  Save it as ~/tdocs/<your-new-slug>/v1/index.html (or anywhere you like).
  Comments below are read-only metadata bundled with the fork. Agents can
  read them to apply changes — say "apply all comments to this doc" and the
  agent will find the anchored regions (marked with TDOC-COMMENT html
  comments inline below) and modify them accordingly.

  ## Comments included in this export
  ${openComments.length} comment(s).
`;
      for (let i = 0; i < openComments.length; i++) {
        const c = openComments[i];
        const who = c.author?.login ? `@${c.author.login}` : 'anonymous';
        const anchor = c.anchor?.kind === 'element'
          ? `(on ${c.anchor.label || c.anchor.selector || 'element'})`
          : c.anchor?.text ? `(on text: "${c.anchor.text.replace(/"/g, '\\"').slice(0, 120)}")` : '(no anchor)';
        banner += `\n  [${i + 1}] ${who} ${anchor}\n    "${c.text.replace(/\n/g, ' ')}"\n${reactionsText(c.reactions)}`;
        if (Array.isArray(c.replies)) {
          for (const r of c.replies) {
            const rWho = r.author?.login ? `@${r.author.login}` : 'anonymous';
            banner += `      ↳ ${rWho}: "${r.text.replace(/\n/g, ' ')}"\n${reactionsText(r.reactions).replace(/^/gm, '  ')}`;
          }
        }
      }
      banner += `\n  ===== end tdoc fork export =====\n-->\n`;

      // 2. Embed structured JSON for programmatic parsing.
      const jsonBlock = `<script type="application/json" id="tdoc-fork-comments">${
        safeJsonForScript({ slug, version: Number(vStr), exported: new Date().toISOString(), comments: openComments })
      }</script>\n`;

      // 3. Inline TDOC-COMMENT markers around anchored text. Done with simple
      //    text replacement; if the same text appears multiple times, we mark
      //    only the first occurrence (matches the live anchor behavior).
      for (const c of openComments) {
        if (c.anchor?.kind !== 'text' && !c.anchor?.text) continue;
        const needle = c.anchor.text;
        if (!needle || needle.length < 2) continue;
        const idx = html.indexOf(needle);
        if (idx === -1) continue;
        const replacement = `<!--TDOC-COMMENT id="${c.id}" by="${c.author?.login || 'anonymous'}"-->${needle}<!--/TDOC-COMMENT-->`;
        html = html.slice(0, idx) + replacement + html.slice(idx + needle.length);
      }

      // The fork route boots the overlay in read-only "fork" mode so the
      // user can SEE what they just downloaded — comments rendered as cards,
      // anchors highlighted — without any backend.
      let bodyHtml = html;
      if (kind === 'fork') {
        const forkCfg = { slug, version: Number(vStr), identity: null, authConfigured: false, mode: 'fork', originalSlug: slug };
        const inject =
          `<script>window.__TDOC__ = ${safeJsonForScript(forkCfg)};</script>\n` +
          `<script>${OVERLAY_JS}</script>`;
        if (bodyHtml.includes('</body>')) bodyHtml = bodyHtml.replace('</body>', `${inject}\n</body>`);
        else bodyHtml = bodyHtml + inject;
      }

      const finalHtml = banner + jsonBlock + bodyHtml;
      const dl = url.searchParams.get('download');
      // /export defaults to attachment; /fork defaults to inline. Either can be
      // overridden with ?download=1 / ?download=0.
      const defaultAttach = kind === 'export';
      const forceDownload = dl === '1' || (defaultAttach && dl !== '0');
      const headers = { 'Content-Type': 'text/html; charset=utf-8' };
      if (forceDownload) headers['Content-Disposition'] = `attachment; filename="${slug}-v${vStr}-fork.html"`;
      return new Response(finalHtml, { status: 200, headers });
    }

    // ---- auth ----
    if (p === '/api/auth/me' && method === 'GET') {
      const s = await getSession(env, req);
      return json({
        identity: s ? { login: s.login, avatar_url: s.avatar_url, name: s.name } : null,
        isOwner: isOwnerSession(env, s),
        authConfigured: true,
      });
    }

    if (p === '/api/auth/device/start' && method === 'POST') {
      try {
        const r = await ghPost('/login/device/code', {
          client_id: env.GITHUB_CLIENT_ID,
          scope: 'read:user',
        });
        if (r.error) return json({ error: r.error, message: r.error_description }, { status: 400 });
        return json({
          device_code: r.device_code,
          user_code: r.user_code,
          verification_uri: r.verification_uri,
          expires_in: r.expires_in,
          interval: r.interval,
        });
      } catch (e) {
        return json({ error: 'github_unreachable', message: e.message }, { status: 500 });
      }
    }

    if (p === '/api/auth/device/poll' && method === 'POST') {
      let body = {};
      try { body = await req.json(); } catch {}
      if (!body.device_code) return json({ error: 'device_code required' }, { status: 400 });
      try {
        const r = await ghPost('/login/oauth/access_token', {
          client_id: env.GITHUB_CLIENT_ID,
          device_code: body.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        });
        // Log the response shape (visible in `wrangler tail`) so we can debug
        // the post-approval path that's been hanging on "Waiting…".
        console.log('[poll] gh response keys:', Object.keys(r).join(','), 'error:', r.error || 'none', 'has_token:', !!r.access_token);
        // GitHub returns errors *with* a 200 status. Pending states must keep
        // polling; everything else is a real failure surfaced to the user.
        if (r.error === 'authorization_pending' || r.error === 'slow_down') {
          // Pass GitHub's suggested interval back to the client so it can
          // back off when slow_down is signaled (RFC 8628 §3.5).
          return json({ pending: true, error: r.error, interval: Number(r.interval) || null });
        }
        if (r.error) {
          return json({ error: r.error, message: r.error_description || r.error }, { status: 400 });
        }
        if (!r.access_token) return json({ pending: true });
        console.log('[poll] got access_token, fetching /user');
        const user = await ghUser(r.access_token);
        console.log('[poll] gh /user response keys:', Object.keys(user).join(','), 'login:', user.login || 'none');
        if (!user.login) return json({ error: 'no_user', message: user.message || 'GitHub /user returned no login' }, { status: 500 });
        const sid = rand(24);
        const session = {
          token: r.access_token,
          login: user.login,
          avatar_url: user.avatar_url,
          name: user.name || user.login,
          created: new Date().toISOString(),
        };
        // 30 day TTL
        await env.META.put(`session:${sid}`, JSON.stringify(session), { expirationTtl: 60 * 60 * 24 * 30 });
        return json(
          { ok: true, identity: { login: user.login, avatar_url: user.avatar_url, name: user.name || user.login } },
          { headers: { 'Set-Cookie': `tdoc_sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}` } }
        );
      } catch (e) {
        return json({ error: 'github_unreachable', message: e.message }, { status: 500 });
      }
    }

    if (p === '/api/auth/logout' && method === 'POST') {
      const sid = parseCookie(req);
      if (sid) await env.META.delete(`session:${sid}`);
      return json({ ok: true }, { headers: { 'Set-Cookie': 'tdoc_sid=; Path=/; Max-Age=0' } });
    }

    // ---- comments ----
    if (p === '/api/comments' && method === 'GET') {
      const slug = url.searchParams.get('slug');
      if (!slug) return json({ error: 'slug required' }, { status: 400 });
      const raw = await env.META.get(`comments:${slug}`);
      return json(raw ? JSON.parse(raw) : []);
    }

    if (p === '/api/comments' && method === 'POST') {
      const s = await getSession(env, req);
      if (!s) return json({ error: 'sign_in_required' }, { status: 401 });
      let body = {};
      try { body = await req.json(); } catch {}
      const { slug, version, anchor, text: commentText, parent_id } = body;
      if (!slug || !commentText) return json({ error: 'slug and text required' }, { status: 400 });
      const raw = await env.META.get(`comments:${slug}`);
      const list = raw ? JSON.parse(raw) : [];
      const author = { login: s.login, avatar_url: s.avatar_url, name: s.name };
      const created = new Date().toISOString();

      if (parent_id) {
        // Reply: append to parent.replies[]
        const parent = list.find(c => c.id === parent_id);
        if (!parent) return json({ error: 'parent_not_found' }, { status: 404 });
        if (!Array.isArray(parent.replies)) parent.replies = [];
        const reply = {
          id: `r_${Date.now()}_${rand(4)}`,
          parent_id,
          text: commentText,
          author,
          created,
          reactions: {},
        };
        parent.replies.push(reply);
        await env.META.put(`comments:${slug}`, JSON.stringify(list));
        return json(reply);
      }

      const entry = {
        id: `c_${Date.now()}_${rand(4)}`,
        version: version || 1,
        anchor: anchor || null,
        text: commentText,
        author,
        status: 'open',
        created,
        replies: [],
        reactions: {},
      };
      list.push(entry);
      await env.META.put(`comments:${slug}`, JSON.stringify(list));
      return json(entry);
    }

    // Re-anchor a comment. Only the original author can re-anchor their own
    // comment. Same shape as POST except `id` and `anchor` are required.
    if (p === '/api/comments' && method === 'PATCH') {
      const s = await getSession(env, req);
      if (!s) return json({ error: 'sign_in_required' }, { status: 401 });
      let body = {};
      try { body = await req.json(); } catch {}
      const { slug, id, anchor } = body;
      if (!slug || !id || !anchor) return json({ error: 'slug, id, anchor required' }, { status: 400 });
      const raw = await env.META.get(`comments:${slug}`);
      const list = raw ? JSON.parse(raw) : [];
      const target = list.find(c => c.id === id);
      if (!target) return json({ error: 'not_found' }, { status: 404 });
      if (target.author && target.author.login !== s.login) {
        return json({ error: 'not_author' }, { status: 403 });
      }
      // Re-anchoring repoints the comment at different text, so any prior
      // agent verdict is stale — clear status/applied_in and the agent's
      // reaction. The thread (replies, human reactions) stays.
      target.anchor = anchor;
      target.status = 'open';
      delete target.applied_in;
      setAgentReaction(target, null);
      await env.META.put(`comments:${slug}`, JSON.stringify(list));
      return json(target);
    }

    // Admin: wipe ALL comments for a slug (doc owner only — uses the same
    // upload token as /api/upload, so it can be invoked from the publish
    // tooling or an agent that holds the token; the worker's KV is single-
    // tenant so this is safe). Triggered by ?all=1 on DELETE /api/comments.
    if (p === '/api/comments' && method === 'DELETE'
        && url.searchParams.get('all') === '1') {
      const unauth = requireUploadAuth(req, env);
      if (unauth) return unauth;
      const slug = url.searchParams.get('slug');
      if (!slug) return json({ error: 'slug required' }, { status: 400 });
      const raw = await env.META.get(`comments:${slug}`);
      const before = raw ? JSON.parse(raw).length : 0;
      await env.META.delete(`comments:${slug}`);
      return json({ ok: true, deleted: before });
    }
    if (p === '/api/comments' && method === 'DELETE') {
      const s = await getSession(env, req);
      if (!s) return json({ error: 'sign_in_required' }, { status: 401 });
      const slug = url.searchParams.get('slug');
      const id = url.searchParams.get('id');
      if (!slug || !id) return json({ error: 'slug and id required' }, { status: 400 });
      const raw = await env.META.get(`comments:${slug}`);
      const list = raw ? JSON.parse(raw) : [];

      // Top-level comment?
      const top = list.find(c => c.id === id);
      if (top) {
        if (top.author && top.author.login !== s.login) {
          return json({ error: 'not_author' }, { status: 403 });
        }
        await env.META.put(`comments:${slug}`, JSON.stringify(list.filter(c => c.id !== id)));
        return json({ ok: true });
      }
      // Otherwise, find reply
      for (const c of list) {
        if (!Array.isArray(c.replies)) continue;
        const r = c.replies.find(r => r.id === id);
        if (r) {
          if (r.author && r.author.login !== s.login) {
            return json({ error: 'not_author' }, { status: 403 });
          }
          c.replies = c.replies.filter(r => r.id !== id);
          await env.META.put(`comments:${slug}`, JSON.stringify(list));
          return json({ ok: true });
        }
      }
      return json({ error: 'not_found' }, { status: 404 });
    }

    // ---- reactions: toggle emoji on a comment OR reply ----
    if (p === '/api/reactions' && method === 'POST') {
      const s = await getSession(env, req);
      if (!s) return json({ error: 'sign_in_required' }, { status: 401 });
      let body = {};
      try { body = await req.json(); } catch {}
      const { slug, comment_id, emoji } = body;
      if (!slug || !comment_id || !emoji) return json({ error: 'slug, comment_id, emoji required' }, { status: 400 });
      // Basic emoji sanity: <= 8 chars (covers ZWJ sequences), non-empty
      if (emoji.length > 8 || emoji.length === 0) return json({ error: 'invalid_emoji' }, { status: 400 });

      const raw = await env.META.get(`comments:${slug}`);
      const list = raw ? JSON.parse(raw) : [];

      function toggle(target) {
        if (!target.reactions) target.reactions = {};
        const users = target.reactions[emoji] || [];
        const idx = users.indexOf(s.login);
        if (idx >= 0) users.splice(idx, 1);
        else users.push(s.login);
        if (users.length === 0) delete target.reactions[emoji];
        else target.reactions[emoji] = users;
      }

      let target = list.find(c => c.id === comment_id);
      if (!target) {
        for (const c of list) {
          if (!Array.isArray(c.replies)) continue;
          const r = c.replies.find(r => r.id === comment_id);
          if (r) { target = r; break; }
        }
      }
      if (!target) return json({ error: 'not_found' }, { status: 404 });

      toggle(target);
      await env.META.put(`comments:${slug}`, JSON.stringify(list));
      return json({ ok: true, reactions: target.reactions });
    }

    // ---- agent reply (from `tdoc edit` after applying a comment) ----
    // Authenticated with the same upload token as /api/upload — only the doc
    // owner's machine has it, so this can't be spoofed by readers. Posts a
    // reply on the parent comment, attributed to the `tdoc-agent` identity.
    // status values: 'applied', 'partial', 'question'. The status appears as
    // a visible badge on the reply and also flips the parent comment's
    // status to 'applied' / 'open' so the dashboard reflects it.
    if (p === '/api/agent/reply' && method === 'POST') {
      const unauth = requireUploadAuth(req, env);
      if (unauth) return unauth;
      let body = {};
      try { body = await req.json(); } catch {}
      const { slug, parent_id, text: replyText, status: agentStatus, applied_in,
              bind_anchor_aid } = body;
      if (!slug || !parent_id || !replyText) return json({ error: 'slug, parent_id, text required' }, { status: 400 });
      const raw = await env.META.get(`comments:${slug}`);
      const list = raw ? JSON.parse(raw) : [];
      const parent = list.find(c => c.id === parent_id);
      if (!parent) return json({ error: 'parent_not_found' }, { status: 404 });
      if (!Array.isArray(parent.replies)) parent.replies = [];
      const reply = {
        id: `r_${Date.now()}_${rand(4)}`,
        parent_id,
        text: replyText,
        author: { kind: 'agent', login: 'tdoc-agent', name: 'tdoc-agent', avatar_url: null },
        agent_status: ['applied', 'partial', 'question'].includes(agentStatus) ? agentStatus : null,
        created: new Date().toISOString(),
        reactions: {},
      };
      parent.replies.push(reply);
      if (agentStatus === 'applied') {
        parent.status = 'applied';
        if (applied_in) parent.applied_in = applied_in;
      } else if (agentStatus === 'question' || agentStatus === 'partial') {
        parent.status = 'open';
      }
      // OPTIONAL: when the agent resolves a comment, it can also BIND the
      // anchor to a specific artifact aid. This is the right behavior when
      // a user-created comment lacks an element anchor (e.g. kind:"none"
      // because the click missed the artifact) but the comment text clearly
      // references "this artifact" and the agent has identified the target.
      // Without this, agent replies could only resolve status; rebinding
      // required the original author's session, which is impossible from
      // a CI / agent context.
      if (bind_anchor_aid && typeof bind_anchor_aid === 'string') {
        if (!parent.anchor) parent.anchor = {};
        // preserve fallback if present
        const fallback = parent.anchor.fallback;
        parent.anchor = {
          kind: 'element',
          aid: bind_anchor_aid,
          selector: `[data-tdoc-aid="${bind_anchor_aid}"]`,
          label: parent.anchor.label || 'svg',
          ...(fallback ? { fallback } : {}),
        };
      }
      setAgentReaction(parent, agentStatus);
      await env.META.put(`comments:${slug}`, JSON.stringify(list));
      return json(reply);
    }

    // ---- admin upload (from `tdoc publish`) ----
    if (p === '/api/upload' && method === 'POST') {
      const unauth = requireUploadAuth(req, env);
      if (unauth) return unauth;
      let body = {};
      try { body = await req.json(); } catch {}
      const { slug, version, html: doc, meta } = body;
      if (!slug || !version || !doc) return json({ error: 'slug, version, html required' }, { status: 400 });
      // Identity-stamp every commentable artifact with a content-hashed
      // data-tdoc-aid. The SAME artifact in a different version has the
      // SAME aid — so a comment anchored by aid resolves identity-first
      // and cannot drift onto a different artifact.
      const { html: stampedHtml, aids } = stampAids(doc);
      const r2Key = `docs/${slug}/v${version}/index.html`;
      try {
        await env.DOCS.put(r2Key, stampedHtml, {
          httpMetadata: { contentType: 'text/html; charset=utf-8' },
        });
      } catch (e) {
        console.log('[upload] R2 put failed:', e.message);
        return json({ error: 'r2_put_failed', message: e.message }, { status: 500 });
      }
      // Verify the write actually landed before we tell the caller "ok".
      // The previous handler returned ok: true even when the binding was
      // silently dropping writes — leaving us with KV meta but no R2 doc.
      const verify = await env.DOCS.head(r2Key);
      if (!verify) {
        console.log('[upload] R2 write did not persist:', r2Key);
        return json({ error: 'r2_write_lost', message: 'PUT succeeded but the key is not readable. Re-deploy the worker; the R2 binding may be stale.' }, { status: 500 });
      }
      if (meta) await env.META.put(`meta:${slug}`, JSON.stringify(meta));
      // Reconcile existing open comments against the new artifact set:
      // bind by aid where possible; mark lost where the artifact is gone
      // or ambiguous. This is the ENFORCED publish-time invariant — no
      // agent honesty required, no silent re-anchoring to wrong artifacts.
      try {
        const cKey = `comments:${slug}`;
        const raw = await env.META.get(cKey);
        if (raw) {
          const list = JSON.parse(raw);
          const before = JSON.stringify(list);
          reconcileAnchors(list, aids);
          const after = JSON.stringify(list);
          if (after !== before) await env.META.put(cKey, after);
        }
      } catch (e) {
        console.log('[upload] anchor reconcile failed (non-fatal):', e.message);
      }
      return json({ ok: true, url: `/d/${slug}/v/${version}`, size: verify.size, aids: aids.length });
    }

    // ---- admin delete ----
    if (p === '/api/doc' && method === 'DELETE') {
      const unauth = requireUploadAuth(req, env);
      if (unauth) return unauth;
      const slug = url.searchParams.get('slug');
      if (!slug) return json({ error: 'slug required' }, { status: 400 });
      // delete all R2 versions
      let cursor;
      do {
        const r = await env.DOCS.list({ prefix: `docs/${slug}/`, cursor });
        for (const o of r.objects) await env.DOCS.delete(o.key);
        cursor = r.truncated ? r.cursor : undefined;
      } while (cursor);
      await env.META.delete(`meta:${slug}`);
      await env.META.delete(`comments:${slug}`);
      return json({ ok: true });
    }

    return text('Not found', { status: 404 });
  },
};
