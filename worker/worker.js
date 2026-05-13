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
function rand(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

function injectOverlay(rawHtml, slug, version, identity) {
  const cfg = {
    slug, version,
    identity: identity || null,
    authConfigured: true,
    mode: 'published',
  };
  const inject =
    `<script>window.__TDOC__ = ${JSON.stringify(cfg)};</script>\n` +
    `<script>${OVERLAY_JS}</script>`;
  if (rawHtml.includes('</body>')) return rawHtml.replace('</body>', `${inject}\n</body>`);
  return rawHtml + inject;
}

async function indexHtml(env) {
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
</style></head><body>
<h1>tdoc</h1><p class="sub">Published prompt-native documents.</p>
${rows.length === 0 ? '<p class="empty">No published docs yet.</p>' :
  `<table><thead><tr><th>Title</th><th>Slug</th><th>Version</th></tr></thead><tbody>${rows.join('')}</tbody></table>`}
</body></html>`;
}

// ---- GitHub helpers ----
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
  return r.json();
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

    // ---- index ----
    if (p === '/' && method === 'GET') return html(await indexHtml(env));

    // ---- doc view ----
    const docMatch = p.match(/^\/d\/([^/]+)\/v\/(\d+)\/?$/);
    if (docMatch && method === 'GET') {
      const [, slug, vStr] = docMatch;
      const obj = await env.DOCS.get(`docs/${slug}/v${vStr}/index.html`);
      if (!obj) return text(`Not found: ${slug} v${vStr}`, { status: 404 });
      const raw = await obj.text();
      const session = await getSession(env, req);
      const identity = session ? { login: session.login, avatar_url: session.avatar_url, name: session.name } : null;
      return html(injectOverlay(raw, slug, Number(vStr), identity));
    }

    // ---- doc export (fork) ----
    const exportMatch = p.match(/^\/d\/([^/]+)\/v\/(\d+)\/export\/?$/);
    if (exportMatch && method === 'GET') {
      const [, slug, vStr] = exportMatch;
      const obj = await env.DOCS.get(`docs/${slug}/v${vStr}/index.html`);
      if (!obj) return text(`Not found: ${slug} v${vStr}`, { status: 404 });
      const raw = await obj.text();
      const banner =
`<!--
  tdoc fork export — ${slug} v${vStr}
  Save this file as ~/tdocs/<your-new-slug>/v1/index.html
  Then run: /tdoc list
-->
`;
      return new Response(banner + raw, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="${slug}-v${vStr}.html"`,
        },
      });
    }

    // ---- auth ----
    if (p === '/api/auth/me' && method === 'GET') {
      const s = await getSession(env, req);
      return json({
        identity: s ? { login: s.login, avatar_url: s.avatar_url, name: s.name } : null,
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
        if (r.error) return json({ pending: true, error: r.error });
        if (!r.access_token) return json({ pending: true });
        const user = await ghUser(r.access_token);
        if (!user.login) return json({ error: 'no_user' }, { status: 500 });
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

    // ---- admin upload (from `tdoc publish`) ----
    if (p === '/api/upload' && method === 'POST') {
      const unauth = requireUploadAuth(req, env);
      if (unauth) return unauth;
      let body = {};
      try { body = await req.json(); } catch {}
      const { slug, version, html: doc, meta } = body;
      if (!slug || !version || !doc) return json({ error: 'slug, version, html required' }, { status: 400 });
      await env.DOCS.put(`docs/${slug}/v${version}/index.html`, doc, {
        httpMetadata: { contentType: 'text/html; charset=utf-8' },
      });
      if (meta) await env.META.put(`meta:${slug}`, JSON.stringify(meta));
      return json({ ok: true, url: `/d/${slug}/v/${version}` });
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
