#!/usr/bin/env node
// tdoc local server — anonymous, $0, zero-config.
// Serves docs from ~/tdocs/<slug>/v<N>/index.html. No auth, no GitHub.
// Auth lives entirely in the published Worker. Node 18+, no deps.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = process.env.TDOC_PORT ? Number(process.env.TDOC_PORT) : 7878;
const ROOT = process.env.TDOC_DIR || path.join(os.homedir(), 'tdocs');
const OVERLAY_PATH = path.join(__dirname, 'overlay.js');

fs.mkdirSync(ROOT, { recursive: true });

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}
function json(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json', ...headers });
}
function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', d => b += d);
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}

// Escape `</script>` and HTML comment terminators so a malicious or stray value
// inside the JSON payload can't break out of the surrounding <script> block.
function safeJsonForScript(obj) {
  return JSON.stringify(obj).replace(/<\/script>/gi, '<\\/script>').replace(/<!--/g, '<\\!--');
}

function injectOverlay(html, slug, version) {
  const overlay = fs.readFileSync(OVERLAY_PATH, 'utf8');
  const cfg = `<script>window.__TDOC__ = ${safeJsonForScript({
    slug, version, identity: null, authConfigured: false, mode: 'local'
  })};</script>`;
  const inject = `${cfg}\n<script>${overlay}</script>`;
  if (html.includes('</body>')) return html.replace('</body>', `${inject}\n</body>`);
  return html + inject;
}

function indexPage() {
  const slugs = fs.readdirSync(ROOT).filter(f => {
    try { return fs.statSync(path.join(ROOT, f)).isDirectory() && !f.startsWith('.'); }
    catch { return false; }
  });
  const rows = slugs.map(slug => {
    const meta = readJson(path.join(ROOT, slug, 'meta.json'), { title: slug, versions: [] });
    const latest = meta.versions?.[meta.versions.length - 1]?.n || 1;
    const comments = readJson(path.join(ROOT, slug, 'comments.json'), []);
    const open = comments.filter(c => c.status === 'open').length;
    return `<tr>
      <td><a href="/d/${slug}/v/${latest}">${meta.title || slug}</a></td>
      <td>${slug}</td>
      <td>v${latest}</td>
      <td>${open ? `<b>${open} open</b>` : '—'}</td>
    </tr>`;
  }).join('');
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
<h1>tdoc</h1><p class="sub">Prompt-native documents.</p>
${slugs.length === 0 ? '<p class="empty">No docs yet. Try <code>/tdoc new &lt;prompt&gt;</code>.</p>' :
  `<table><thead><tr><th>Title</th><th>Slug</th><th>Version</th><th>Comments</th></tr></thead><tbody>${rows}</tbody></table>`}
</body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  if (p === '/api/ping') return json(res, 200, { ok: true });

  if (p === '/') return send(res, 200, indexPage(), { 'Content-Type': 'text/html; charset=utf-8' });

  const docMatch = p.match(/^\/d\/([^/]+)\/v\/(\d+)\/?$/);
  if (docMatch) {
    const [, slug, vStr] = docMatch;
    const file = path.join(ROOT, slug, `v${vStr}`, 'index.html');
    if (!fs.existsSync(file)) return send(res, 404, `Not found: ${slug} v${vStr}`);
    const html = fs.readFileSync(file, 'utf8');
    return send(res, 200, injectOverlay(html, slug, Number(vStr)), { 'Content-Type': 'text/html; charset=utf-8' });
  }

  // --- COMMENTS (anonymous) ---
  if (p === '/api/comments' && req.method === 'GET') {
    const slug = url.searchParams.get('slug');
    if (!slug) return json(res, 400, { error: 'slug required' });
    return json(res, 200, readJson(path.join(ROOT, slug, 'comments.json'), []));
  }

  if (p === '/api/comments' && req.method === 'POST') {
    const body = await readBody(req);
    const { slug, version, anchor, text, parent_id } = body;
    if (!slug || !text) return json(res, 400, { error: 'slug and text required' });
    const file = path.join(ROOT, slug, 'comments.json');
    const comments = readJson(file, []);
    const created = new Date().toISOString();
    if (parent_id) {
      const parent = comments.find(c => c.id === parent_id);
      if (!parent) return json(res, 404, { error: 'parent_not_found' });
      if (!Array.isArray(parent.replies)) parent.replies = [];
      const reply = { id: `r_${Date.now()}`, parent_id, text, author: null, created, reactions: {} };
      parent.replies.push(reply);
      writeJson(file, comments);
      return json(res, 200, reply);
    }
    const entry = {
      id: `c_${Date.now()}`,
      version: version || 1,
      anchor: anchor || null,
      text,
      author: null,
      status: 'open',
      created,
      replies: [],
      reactions: {}
    };
    comments.push(entry);
    writeJson(file, comments);
    return json(res, 200, entry);
  }

  // Agent reply: posts a reply attributed to `tdoc-agent` and updates the
  // parent comment's status. Local: no auth (anyone running the local server
  // is the doc owner). Mirrors /api/agent/reply on the published worker.
  if (p === '/api/agent/reply' && req.method === 'POST') {
    const body = await readBody(req);
    const { slug, parent_id, text, status: agentStatus, applied_in } = body;
    if (!slug || !parent_id || !text) return json(res, 400, { error: 'slug, parent_id, text required' });
    const file = path.join(ROOT, slug, 'comments.json');
    const all = readJson(file, []);
    const parent = all.find(c => c.id === parent_id);
    if (!parent) return json(res, 404, { error: 'parent_not_found' });
    if (!Array.isArray(parent.replies)) parent.replies = [];
    const reply = {
      id: `r_${Date.now()}`,
      parent_id,
      text,
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
    writeJson(file, all);
    return json(res, 200, reply);
  }

  // Re-anchor an existing comment without changing its text/thread state.
  // Used by the "click unanchored, then select new text" flow.
  if (p === '/api/comments' && req.method === 'PATCH') {
    const body = await readBody(req);
    const { slug, id, anchor } = body;
    if (!slug || !id || !anchor) return json(res, 400, { error: 'slug, id, anchor required' });
    const file = path.join(ROOT, slug, 'comments.json');
    const all = readJson(file, []);
    const target = all.find(c => c.id === id);
    if (!target) return json(res, 404, { error: 'not_found' });
    target.anchor = anchor;
    writeJson(file, all);
    return json(res, 200, target);
  }

  if (p === '/api/comments' && req.method === 'DELETE') {
    const slug = url.searchParams.get('slug');
    const id = url.searchParams.get('id');
    if (!slug || !id) return json(res, 400, { error: 'slug and id required' });
    const file = path.join(ROOT, slug, 'comments.json');
    const all = readJson(file, []);
    const top = all.find(c => c.id === id);
    if (top) {
      writeJson(file, all.filter(c => c.id !== id));
      return json(res, 200, { ok: true });
    }
    for (const c of all) {
      if (!Array.isArray(c.replies)) continue;
      if (c.replies.some(r => r.id === id)) {
        c.replies = c.replies.filter(r => r.id !== id);
        writeJson(file, all);
        return json(res, 200, { ok: true });
      }
    }
    return json(res, 404, { error: 'not_found' });
  }

  // Reactions: anonymous on local, keyed by an "anon" pseudo-user so toggling works
  if (p === '/api/reactions' && req.method === 'POST') {
    const body = await readBody(req);
    const { slug, comment_id, emoji } = body;
    if (!slug || !comment_id || !emoji) return json(res, 400, { error: 'slug, comment_id, emoji required' });
    if (emoji.length === 0 || emoji.length > 8) return json(res, 400, { error: 'invalid_emoji' });
    const file = path.join(ROOT, slug, 'comments.json');
    const all = readJson(file, []);
    function findTarget(list) {
      for (const c of list) {
        if (c.id === comment_id) return c;
        if (Array.isArray(c.replies)) {
          for (const r of c.replies) if (r.id === comment_id) return r;
        }
      }
      return null;
    }
    const target = findTarget(all);
    if (!target) return json(res, 404, { error: 'not_found' });
    if (!target.reactions) target.reactions = {};
    const users = target.reactions[emoji] || [];
    const me = 'anon';
    const idx = users.indexOf(me);
    if (idx >= 0) users.splice(idx, 1);
    else users.push(me);
    if (users.length === 0) delete target.reactions[emoji];
    else target.reactions[emoji] = users;
    writeJson(file, all);
    return json(res, 200, { ok: true, reactions: target.reactions });
  }

  // --- PUBLISH ---
  // Shells out to bin/tdoc-publish <slug>. Returns { url }. Slow (20–60s on
  // first run); the browser modal shows a "this can take a minute" hint.
  // Honor TDOC_DRY_PUBLISH=1 for tests — echoes "would publish <slug>" and
  // returns a fake URL without invoking wrangler.
  if (p === '/api/publish' && req.method === 'POST') {
    const body = await readBody(req);
    const slug = body.slug;
    if (!slug || !/^[a-zA-Z0-9_-]{1,64}$/.test(slug)) {
      return json(res, 400, { error: 'invalid slug' });
    }
    if (process.env.TDOC_DRY_PUBLISH === '1') {
      return json(res, 200, {
        ok: true,
        dry: true,
        url: `https://example.workers.dev/d/${slug}/v/1`,
        stdout: `would publish ${slug}\n`,
      });
    }
    const bin = path.join(__dirname, '..', 'bin', 'tdoc-publish');
    if (!fs.existsSync(bin)) return json(res, 500, { error: 'tdoc-publish script not found' });
    const proc = spawn(bin, [slug], { env: process.env });
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    proc.on('close', (code) => {
      if (code !== 0) {
        return json(res, 500, { error: 'publish_failed', code, stdout: out, stderr: err });
      }
      // tdoc-publish ends with "Published: <URL>"
      const m = out.match(/Published:\s*(https?:\/\/\S+)/);
      const url = m ? m[1] : null;
      return json(res, 200, { ok: true, url, stdout: out });
    });
    return;
  }

  send(res, 404, 'Not found');
});

server.listen(PORT, () => {
  console.log(`tdoc server: http://localhost:${PORT}  (root: ${ROOT})`);
  console.log('mode: local (anonymous, no auth)');
});
