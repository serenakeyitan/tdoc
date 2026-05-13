(function () {
  const cfg = window.__TDOC__ || {};
  const { slug, version } = cfg;
  const mode = cfg.mode || 'local';            // "local" or "published"
  const isPublished = mode === 'published';
  let identity = cfg.identity || null;
  if (!slug) return;

  const css = `
  .tdoc-bar { position: fixed; top: 0; left: 0; right: 0; height: 44px; background: #0a0a0a; color: #fff;
    display: flex; align-items: center; padding: 0 16px; font: 13px system-ui, sans-serif; z-index: 999999; gap: 12px; }
  .tdoc-bar .title { font-weight: 600; }
  .tdoc-bar .slug { color: #888; }
  .tdoc-bar .spacer { flex: 1; }
  .tdoc-bar button { background: transparent; border: 1px solid #2a2a2a; color: #ddd; padding: 5px 10px;
    border-radius: 6px; font: inherit; cursor: pointer; transition: background 0.12s, color 0.12s, border-color 0.12s; }
  .tdoc-bar button:hover { background: #1c1c1c; color: #fff; border-color: #444; }
  .tdoc-icon-btn { display: inline-flex; align-items: center; gap: 6px; }
  .tdoc-menu-wrap { position: relative; display: inline-block; }
  .tdoc-menu { position: absolute; top: calc(100% + 6px); right: 0; background: #0f0f0f;
    border: 1px solid #2a2a2a; border-radius: 8px; padding: 4px; min-width: 180px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5); display: none; z-index: 1000000; }
  .tdoc-menu.open { display: block; }
  .tdoc-menu button { display: block; width: 100%; text-align: left; border: none; background: transparent;
    color: #ddd; padding: 8px 12px; border-radius: 4px; font: 13px system-ui, sans-serif; cursor: pointer; }
  .tdoc-menu button:hover { background: #1c1c1c; color: #fff; }
  body { padding-top: 44px !important; }

  .tdoc-chip { display: flex; align-items: center; gap: 8px; padding: 3px 12px 3px 3px;
    background: #1c1c1c; border: 1px solid #333; border-radius: 999px; cursor: pointer; color: #fff; font: inherit; }
  .tdoc-chip:hover { background: #2a2a2a; }
  .tdoc-chip img { width: 28px; height: 28px; border-radius: 50%; }
  .tdoc-chip .name { font-size: 13px; }
  .tdoc-chip.signin { padding: 6px 14px; background: #1652f0; border-color: #1652f0; }
  .tdoc-chip.signin:hover { background: #1245d0; }

  .tdoc-popup { position: absolute; background: #0a0a0a; color: #fff; border-radius: 10px;
    padding: 14px; width: 320px; box-shadow: 0 12px 40px rgba(0,0,0,0.4); z-index: 999998;
    font: 13px system-ui, sans-serif; }
  .tdoc-popup .head { display: flex; justify-content: space-between; margin-bottom: 8px; }
  .tdoc-popup .head .h { color: #aaa; }
  .tdoc-popup .head .x { cursor: pointer; color: #888; }
  .tdoc-popup textarea { width: 100%; min-height: 64px; background: transparent; color: #fff;
    border: 1px solid #1652f0; border-radius: 6px; padding: 8px; font: inherit; resize: vertical;
    box-sizing: border-box; outline: none; }
  .tdoc-popup .foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
  .tdoc-popup .hint { color: #888; font-size: 11px; }
  .tdoc-popup .submit { background: #1652f0; border: none; color: #fff; padding: 6px 14px;
    border-radius: 6px; cursor: pointer; font: inherit; font-weight: 500; }
  .tdoc-popup .submit:hover { background: #1245d0; }
  .tdoc-popup .signin-needed { color: #f5a623; font-size: 12px; padding: 8px 0; }

  /* Floating margin comments (bdocs-style) */
  /* Resting: subtle pale yellow, no underline.
     box-decoration-break: clone makes the highlight paint per-line, so it
     never extends past the last character into the page's line-end margin. */
  .tdoc-anchor-mark { background: #fff7d0; border-radius: 0; cursor: pointer;
    margin: 0; padding: 0; border: 0;
    -webkit-box-decoration-break: clone; box-decoration-break: clone;
    transition: background 0.15s, box-shadow 0.15s; }
  .tdoc-anchor-mark:hover { background: #fdedb0; }
  /* Nested marks: transparent so the outer mark paints continuously underneath. */
  .tdoc-anchor-mark .tdoc-anchor-mark { background: transparent; }
  /* Active (clicked): bright yellow + underline. Active wins over the nested-transparent rule. */
  .tdoc-anchor-mark.active,
  .tdoc-anchor-mark .tdoc-anchor-mark.active { background: #fff3a8; box-shadow: 0 -1.5px 0 0 #f0d000 inset; }
  .tdoc-margin-comment { position: absolute; width: 280px; background: #fff; border: 1px solid #e5e5e5;
    border-radius: 10px; padding: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    font: 13px system-ui, sans-serif; transition: box-shadow 0.15s, transform 0.15s; z-index: 999996; }
  .tdoc-margin-comment.active { box-shadow: 0 4px 16px rgba(22,82,240,0.18); border-color: #1652f0; }
  .tdoc-margin-comment.tdoc-unanchored { border-style: dashed; }
  .tdoc-margin-comment.tdoc-unanchored::before { content: 'unanchored'; display: block;
    font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
  .tdoc-margin-comment .author { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .tdoc-margin-comment .author img { width: 24px; height: 24px; border-radius: 50%; }
  .tdoc-margin-comment .author .login { font-weight: 600; color: #111; font-size: 13px; }
  .tdoc-margin-comment .author .anon { color: #888; font-style: italic; }
  .tdoc-margin-comment .text { color: #111; line-height: 1.45; word-wrap: break-word; }
  .tdoc-margin-comment .meta { font-size: 11px; color: #888; margin-top: 8px;
    display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .tdoc-margin-comment .meta > span:first-child { flex: 1 1 auto; min-width: 0; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  .tdoc-margin-comment .del { cursor: pointer; color: #c33; }
  .tdoc-margin-comment .del:hover { text-decoration: underline; }
  .tdoc-margin-comment .actions { display: inline-flex; gap: 8px; align-items: center; flex-shrink: 0; }
  .tdoc-margin-comment .copy-md { cursor: pointer; color: #888; display: inline-flex; align-items: center; }
  .tdoc-margin-comment .copy-md:hover { color: #1652f0; }
  .tdoc-margin-comment .copy-md svg { width: 14px; height: 14px; display: block; }
  .tdoc-margin-comment .tdoc-reply-toggle { cursor: pointer; color: #1652f0; }
  .tdoc-margin-comment .tdoc-reply-toggle:hover { text-decoration: underline; }

  /* Reactions */
  .tdoc-reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; align-items: center; }
  .tdoc-react-chip { display: inline-flex; align-items: center; gap: 4px; font: 12px system-ui;
    background: #f5f6f8; border: 1px solid #e5e5e5; border-radius: 999px; padding: 2px 8px; cursor: pointer;
    color: #333; transition: background 0.12s, border-color 0.12s; }
  .tdoc-react-chip:hover { background: #eef0f3; }
  .tdoc-react-chip.mine { background: #e8eeff; border-color: #1652f0; color: #1652f0; }
  .tdoc-react-add { background: transparent; border: none; color: #aaa; padding: 0; cursor: pointer;
    line-height: 1; transition: color 0.12s, opacity 0.12s;
    display: inline-flex; align-items: center; }
  .tdoc-react-add svg { width: 16px; height: 16px; display: block; }
  /* In the chips row: only visible on hover unless chips exist (then always) */
  .tdoc-reactions .tdoc-react-add { opacity: 0; padding: 2px 4px; }
  .tdoc-margin-comment:hover .tdoc-reactions .tdoc-react-add,
  .tdoc-reply:hover .tdoc-reactions .tdoc-react-add,
  .tdoc-reactions:has(.tdoc-react-chip) .tdoc-react-add { opacity: 1; }
  /* Inline (in meta row when no chips yet): smaller, always visible on hover-card */
  .tdoc-react-add.inline svg { width: 14px; height: 14px; }
  .tdoc-react-add.inline { opacity: 0.55; vertical-align: middle; }
  .tdoc-react-add:hover { color: #1652f0; opacity: 1; }
  .tdoc-emoji-picker { position: absolute; background: #fff; border: 1px solid #e5e5e5; border-radius: 8px;
    padding: 6px; display: grid; grid-template-columns: repeat(6, 32px); gap: 2px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12); z-index: 1000001; }
  .tdoc-emoji-picker button { background: transparent; border: none; padding: 0; cursor: pointer;
    border-radius: 4px; width: 32px; height: 32px; font-size: 18px; line-height: 1;
    display: inline-flex; align-items: center; justify-content: center; }
  .tdoc-emoji-picker button:hover { background: #f5f6f8; }
  .tdoc-emoji-picker button.tdoc-emoji-text { grid-column: span 6; height: auto; padding: 6px 8px;
    font-size: 12px; font-weight: 600; color: #1652f0; }
  .tdoc-emoji-picker button.tdoc-emoji-text:hover { background: #e8eeff; }

  /* Replies — collapsed by default */
  .tdoc-replies-toggle { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #eee;
    display: inline-flex; align-items: center; gap: 4px; cursor: pointer;
    font-size: 12px; color: #1652f0; user-select: none; }
  .tdoc-replies-toggle:hover { text-decoration: underline; }
  .tdoc-replies-toggle .chev { transition: transform 0.15s; }
  .tdoc-replies-toggle.open .chev { transform: rotate(90deg); }
  .tdoc-replies { display: none; flex-direction: column; gap: 10px; margin-top: 10px; }
  .tdoc-replies.open { display: flex; }
  .tdoc-reply { padding-left: 12px; border-left: 2px solid #e5e5e5; }
  .tdoc-reply .author { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .tdoc-reply .author img { width: 18px; height: 18px; border-radius: 50%; }
  .tdoc-reply .author .login { font-weight: 600; font-size: 12px; color: #111; }
  .tdoc-reply .author .anon { color: #888; font-style: italic; font-size: 12px; }
  .tdoc-reply .text { color: #222; font-size: 13px; line-height: 1.4; word-wrap: break-word; }
  .tdoc-reply .meta { font-size: 11px; color: #888; margin-top: 4px; display: flex; justify-content: space-between; }
  .tdoc-reply .del { cursor: pointer; color: #c33; }
  .tdoc-reply .del:hover { text-decoration: underline; }

  /* Reply form */
  .tdoc-reply-form { display: none; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #eee; }
  .tdoc-reply-form.open { display: block; }
  .tdoc-reply-form textarea { width: 100%; min-height: 48px; box-sizing: border-box; padding: 6px 8px;
    font: 13px system-ui; border: 1px solid #ccc; border-radius: 6px; resize: vertical; outline: none; }
  .tdoc-reply-form textarea:focus { border-color: #1652f0; }
  .tdoc-reply-form-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
  .tdoc-reply-form-foot .hint { color: #888; font-size: 11px; }
  .tdoc-reply-form-foot .tdoc-reply-submit { background: #1652f0; color: #fff; border: none; border-radius: 6px;
    padding: 5px 12px; font: 12px system-ui; cursor: pointer; }
  .tdoc-reply-form-foot .tdoc-reply-submit:hover { background: #1245d0; }
  .tdoc-comments-empty-toast { position: fixed; bottom: 24px; right: 24px; background: #0a0a0a; color: #fff;
    padding: 10px 14px; border-radius: 8px; font: 12px system-ui, sans-serif; opacity: 0.9; z-index: 999996; }

  .tdoc-hover-outline { position: absolute; pointer-events: none; z-index: 999995;
    border: 2px dashed #1652f0; border-radius: 4px; background: rgba(22,82,240,0.06);
    box-sizing: border-box; transition: opacity 0.12s; }
  .tdoc-hover-hint { position: absolute; pointer-events: none; z-index: 999998;
    background: #0a0a0a; color: #fff; font: 11px system-ui; padding: 3px 8px;
    border-radius: 4px; opacity: 0.92; white-space: nowrap; }
  .tdoc-drag-marquee { position: absolute; pointer-events: none; z-index: 999997;
    border: 1.5px solid #1652f0; background: rgba(22,82,240,0.1); box-sizing: border-box; }

  /* Resting: thin subtle blue outline, no background tint (preserve artifact colors) */
  .tdoc-element-outline { position: absolute; pointer-events: none; border: 1.5px solid rgba(22,82,240,0.35);
    border-radius: 4px; box-sizing: border-box; z-index: 999995;
    transition: border-color 0.15s, box-shadow 0.15s, border-width 0.15s; }
  /* Pending (while user is composing a new comment): yellow to match text highlight */
  .tdoc-element-outline.pending { border-color: #f0d000; border-width: 2px; background: transparent; }
  /* Active (clicked): full strength + halo */
  .tdoc-element-outline.active { border-color: #1652f0; border-width: 2px;
    box-shadow: 0 0 0 4px rgba(22,82,240,0.18); }

  .tdoc-pending-highlight { background: #fff3a8; box-shadow: 0 0 0 1px #f0d000 inset; border-radius: 2px;
    -webkit-box-decoration-break: clone; box-decoration-break: clone; }

  .tdoc-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 1000000;
    display: flex; align-items: center; justify-content: center; font: 14px system-ui, sans-serif; }
  .tdoc-modal { background: #fff; color: #111; border-radius: 12px; padding: 28px; width: 460px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
  .tdoc-modal h3 { margin: 0 0 8px; font-size: 20px; }
  .tdoc-modal p { margin: 0 0 14px; color: #444; line-height: 1.5; }
  .tdoc-modal .code { background: #0a0a0a; color: #fff; padding: 18px; border-radius: 8px;
    font: 24px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 0.15em;
    text-align: center; margin: 0 0 14px; user-select: all; cursor: copy; }
  .tdoc-modal .step { display: flex; gap: 10px; margin-bottom: 8px; color: #444; }
  .tdoc-modal .step .n { width: 22px; height: 22px; border-radius: 50%; background: #1652f0; color: #fff;
    display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
  .tdoc-modal .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  .tdoc-modal button { padding: 8px 16px; border-radius: 6px; font: inherit; cursor: pointer; border: 1px solid #ccc; background: #fff; }
  .tdoc-modal button.primary { background: #1652f0; border-color: #1652f0; color: #fff; }
  .tdoc-modal button.primary:hover { background: #1245d0; }
  .tdoc-modal .status { color: #888; font-size: 13px; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // --- top bar ---
  const bar = document.createElement('div');
  bar.className = 'tdoc-bar';
  bar.innerHTML = `
    <span class="title" id="tdoc-title">tdoc</span>
    <span class="slug">${slug} · v${version}${isPublished ? ' · published' : ''}</span>
    <span class="spacer"></span>
    <div class="tdoc-menu-wrap">
      <button id="tdoc-copy-md-btn" class="tdoc-icon-btn" title="Copy as Markdown" aria-label="Copy as Markdown">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy</span>
      </button>
      <div class="tdoc-menu" id="tdoc-copy-md-menu">
        <button data-mode="doc">Doc only</button>
        <button data-mode="doc-comments">Doc + comments</button>
      </div>
    </div>
    ${isPublished ? '<button id="tdoc-fork-btn">Fork</button>' : ''}
    <button id="tdoc-home-btn">All docs</button>
    <span id="tdoc-identity-slot"></span>
  `;
  document.body.appendChild(bar);
  document.getElementById('tdoc-home-btn').onclick = () => location.href = '/';

  // Copy MD dropdown
  const copyBtn = document.getElementById('tdoc-copy-md-btn');
  const copyMenu = document.getElementById('tdoc-copy-md-menu');
  copyBtn.onclick = (e) => {
    e.stopPropagation();
    copyMenu.classList.toggle('open');
  };
  copyMenu.querySelectorAll('button').forEach(b => {
    b.onclick = async (e) => {
      e.stopPropagation();
      copyMenu.classList.remove('open');
      if (b.dataset.mode === 'doc') await window.__tdocCopyDocMd(false);
      else await window.__tdocCopyDocMd(true);
    };
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tdoc-menu-wrap')) copyMenu.classList.remove('open');
  });
  if (isPublished) {
    const fb = document.getElementById('tdoc-fork-btn');
    if (fb) fb.onclick = () => {
      // v1: download raw HTML export with import instructions
      window.location.href = `/d/${encodeURIComponent(slug)}/v/${version}/export`;
    };
  }

  const t = document.querySelector('title');
  if (t && t.textContent) document.getElementById('tdoc-title').textContent = t.textContent;

  function renderIdentity() {
    const slot = document.getElementById('tdoc-identity-slot');
    if (!isPublished) { slot.innerHTML = ''; return; }    // local: no chip
    if (identity) {
      slot.innerHTML = `<button class="tdoc-chip" id="tdoc-me"><img src="${identity.avatar_url}" alt=""><span class="name">${escapeHtml(identity.login)}</span></button>`;
      document.getElementById('tdoc-me').onclick = async () => {
        if (confirm(`Sign out ${identity.login}?`)) {
          await fetch('/api/auth/logout', { method: 'POST' });
          identity = null;
          renderIdentity();
          refreshComments();
        }
      };
    } else {
      slot.innerHTML = `<button class="tdoc-chip signin" id="tdoc-signin">Sign in with GitHub</button>`;
      document.getElementById('tdoc-signin').onclick = startDeviceFlow;
    }
  }
  renderIdentity();

  // --- floating margin comments (bdocs-style) ---
  // Layer to hold all positioned comment cards.
  const commentLayer = document.createElement('div');
  commentLayer.id = 'tdoc-comment-layer';
  commentLayer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; pointer-events: none; z-index: 999996;';
  document.body.appendChild(commentLayer);

  let activeComments = [];          // last-fetched open comments
  let anchorEls = new Map();        // comment.id -> mark element in DOM
  let cardEls = new Map();          // comment.id -> floating card element

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // Find anchor text in the document and wrap it with a marker span.
  // Returns the mark element, or null if not found.
  function highlightAnchor(comment) {
    if (!comment.anchor || !comment.anchor.text) return null;
    const needle = comment.anchor.text;
    if (needle.length < 2) return null;
    const before = comment.anchor.context_before || '';
    const after = comment.anchor.context_after || '';

    // Walk text nodes outside our own UI to find a match.
    // NOTE: we INTENTIONALLY allow text nodes inside .tdoc-anchor-mark, so a later
    // comment can anchor on a substring of an already-highlighted range.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.parentElement) return NodeFilter.FILTER_REJECT;
        if (n.parentElement.closest('.tdoc-bar, .tdoc-popup, .tdoc-modal-bg, #tdoc-comment-layer')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let best = null;
    let bestScore = -1;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const idx = node.nodeValue.indexOf(needle);
      if (idx === -1) continue;
      // Score by context match for disambiguation when needle appears multiple times.
      const beforeMatch = node.nodeValue.slice(Math.max(0, idx - before.length), idx);
      const afterStart = idx + needle.length;
      const afterMatch = node.nodeValue.slice(afterStart, afterStart + after.length);
      let score = 0;
      if (before && beforeMatch.endsWith(before.slice(-Math.min(20, before.length)))) score += 2;
      if (after && afterMatch.startsWith(after.slice(0, Math.min(20, after.length)))) score += 2;
      if (score > bestScore) { best = { node, idx }; bestScore = score; }
    }
    if (!best) return null;

    const range = document.createRange();
    range.setStart(best.node, best.idx);
    range.setEnd(best.node, best.idx + needle.length);
    const mark = document.createElement('span');
    mark.className = 'tdoc-anchor-mark';
    mark.dataset.commentId = comment.id;
    try {
      range.surroundContents(mark);
    } catch {
      // fallback: extract and re-insert
      try {
        const frag = range.extractContents();
        mark.appendChild(frag);
        range.insertNode(mark);
      } catch { return null; }
    }
    return mark;
  }

  // First 12 fill a 6-wide × 2-row grid. "LGTM" gets its own full-width row.
  const QUICK_EMOJIS = ['👍', '❤️', '🔥', '🎉', '😂', '🤔', '👀', '🚀', '✅', '❌', '❓', '❗'];
  const QUICK_TEXT_REACTIONS = ['LGTM'];

  function renderAuthor(author) {
    if (author) return `<div class="author"><img src="${author.avatar_url}" alt=""><span class="login">${escapeHtml(author.login)}</span></div>`;
    return `<div class="author"><span class="anon">anonymous</span></div>`;
  }

  const REACT_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/><line x1="19" y1="6" x2="19" y2="10"/><line x1="21" y1="8" x2="17" y2="8"/></svg>`;

  function renderReactionsRow(target) {
    // Only render the chips row when there are reactions. (The add button moves
    // inline into the meta row when there are none, to avoid an empty row.)
    const reactions = target.reactions || {};
    const me = identity?.login || 'anon';
    const entries = Object.entries(reactions).filter(([, users]) => users && users.length > 0);
    if (entries.length === 0) return '';
    const chips = entries.map(([emoji, users]) => {
      const mine = users.includes(me);
      return `<span class="tdoc-react-chip${mine ? ' mine' : ''}" data-emoji="${escapeHtml(emoji)}" data-target-id="${target.id}" title="${users.map(escapeHtml).join(', ')}">${emoji} ${users.length}</span>`;
    }).join('');
    return `<div class="tdoc-reactions" data-target-id="${target.id}">
      ${chips}
      <button class="tdoc-react-add" data-target-id="${target.id}" title="Add reaction" aria-label="Add reaction">${REACT_ICON_SVG}</button>
    </div>`;
  }

  function renderReactInline(target) {
    // Inline add button to slot into the meta row when no chips exist.
    return `<button class="tdoc-react-add inline" data-target-id="${target.id}" title="Add reaction" aria-label="Add reaction">${REACT_ICON_SVG}</button>`;
  }

  function renderReply(reply, parentId) {
    const canDelete = !isPublished || (identity && reply.author && identity.login === reply.author.login);
    const hasReactions = reply.reactions && Object.values(reply.reactions).some(u => u && u.length > 0);
    return `<div class="tdoc-reply" data-comment-id="${reply.id}">
      ${renderAuthor(reply.author)}
      <div class="text">${escapeHtml(reply.text)}</div>
      ${hasReactions ? renderReactionsRow(reply) : ''}
      <div class="meta">
        <span>${new Date(reply.created).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        <span class="actions">
          ${!hasReactions ? renderReactInline(reply) : ''}
          ${canDelete ? `<span class="del" data-id="${reply.id}">delete</span>` : ''}
        </span>
      </div>
    </div>`;
  }

  function buildCard(comment) {
    const card = document.createElement('div');
    card.className = 'tdoc-margin-comment';
    card.dataset.commentId = comment.id;
    card.style.pointerEvents = 'auto';
    const canDelete = !isPublished || (identity && comment.author && identity.login === comment.author.login);
    const replies = Array.isArray(comment.replies) ? comment.replies : [];
    const hasReactions = comment.reactions && Object.values(comment.reactions).some(u => u && u.length > 0);
    card.innerHTML = `
      ${renderAuthor(comment.author)}
      <div class="text">${escapeHtml(comment.text)}</div>
      ${hasReactions ? renderReactionsRow(comment) : ''}
      <div class="meta">
        <span>v${comment.version} · ${new Date(comment.created).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        <span class="actions">
          ${!hasReactions ? renderReactInline(comment) : ''}
          <span class="tdoc-reply-toggle" data-id="${comment.id}">Reply</span>
          <span class="copy-md" data-id="${comment.id}" title="Copy as Markdown" aria-label="Copy as Markdown"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>
          ${canDelete ? `<span class="del" data-id="${comment.id}">delete</span>` : ''}
        </span>
      </div>
      ${replies.length ? `
        <div class="tdoc-replies-toggle" data-id="${comment.id}">
          <svg class="chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}
        </div>
        <div class="tdoc-replies">${replies.map(r => renderReply(r, comment.id)).join('')}</div>
      ` : ''}
      <div class="tdoc-reply-form" data-parent-id="${comment.id}">
        <textarea placeholder="Reply…"></textarea>
        <div class="tdoc-reply-form-foot">
          <span class="hint">⌘+Enter to submit · Esc to cancel</span>
          <button class="tdoc-reply-submit">Reply</button>
        </div>
      </div>
    `;

    // Wire replies toggle (collapsed by default)
    const repliesToggle = card.querySelector('.tdoc-replies-toggle');
    const repliesEl = card.querySelector('.tdoc-replies');
    if (repliesToggle && repliesEl) {
      repliesToggle.onclick = (e) => {
        e.stopPropagation();
        const open = repliesEl.classList.toggle('open');
        repliesToggle.classList.toggle('open', open);
        requestAnimationFrame(repositionCards);
      };
    }

    // Wire copy
    const copyBtn = card.querySelector('.copy-md');
    if (copyBtn) copyBtn.onclick = (e) => {
      e.stopPropagation();
      window.__tdocCopyCommentMd(comment.id, copyBtn);
    };

    // Wire delete on the top comment + on each reply
    card.querySelectorAll('.del').forEach(del => {
      del.onclick = async (e) => {
        e.stopPropagation();
        await fetch(`/api/comments?slug=${encodeURIComponent(slug)}&id=${del.dataset.id}`, { method: 'DELETE' });
        refreshComments();
      };
    });

    // Wire Reply toggle
    const replyToggle = card.querySelector('.tdoc-reply-toggle');
    const replyForm = card.querySelector('.tdoc-reply-form');
    if (replyToggle && replyForm) {
      replyToggle.onclick = (e) => {
        e.stopPropagation();
        if (isPublished && !identity) {
          startDeviceFlow();
          return;
        }
        replyForm.classList.toggle('open');
        if (replyForm.classList.contains('open')) {
          replyForm.querySelector('textarea').focus();
          requestAnimationFrame(repositionCards);
        }
      };
    }
    const replyTa = replyForm.querySelector('textarea');
    const replySubmitBtn = replyForm.querySelector('.tdoc-reply-submit');
    const submitReply = async () => {
      const text = replyTa.value.trim();
      if (!text) return;
      const r = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, parent_id: comment.id, text })
      });
      if (r.status === 401) { startDeviceFlow(); return; }
      replyTa.value = '';
      replyForm.classList.remove('open');
      await refreshComments();
    };
    replySubmitBtn.onclick = (e) => { e.stopPropagation(); submitReply(); };
    replyTa.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitReply(); }
      if (e.key === 'Escape') { replyForm.classList.remove('open'); requestAnimationFrame(repositionCards); }
    });

    // Wire reaction chips (toggle on click) + add button (emoji picker)
    card.querySelectorAll('.tdoc-react-chip').forEach(chip => {
      chip.onclick = async (e) => {
        e.stopPropagation();
        if (isPublished && !identity) { startDeviceFlow(); return; }
        await fetch('/api/reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, comment_id: chip.dataset.targetId, emoji: chip.dataset.emoji })
        });
        await refreshComments();
      };
    });
    card.querySelectorAll('.tdoc-react-add').forEach(addBtn => {
      addBtn.onclick = (e) => {
        e.stopPropagation();
        if (isPublished && !identity) { startDeviceFlow(); return; }
        openEmojiPicker(addBtn, addBtn.dataset.targetId);
      };
    });
    return card;
  }

  let emojiPicker = null;
  function closeEmojiPicker() { if (emojiPicker) { emojiPicker.remove(); emojiPicker = null; } }
  function openEmojiPicker(anchorBtn, targetId) {
    closeEmojiPicker();
    emojiPicker = document.createElement('div');
    emojiPicker.className = 'tdoc-emoji-picker';
    emojiPicker.innerHTML =
      QUICK_EMOJIS.map(e => `<button data-emoji="${e}">${e}</button>`).join('') +
      QUICK_TEXT_REACTIONS.map(t => `<button class="tdoc-emoji-text" data-emoji="${t}">${t}</button>`).join('');
    document.body.appendChild(emojiPicker);
    const r = anchorBtn.getBoundingClientRect();
    // Position the picker so it never spills off-screen.
    // Measure first (off-screen), then place.
    emojiPicker.style.visibility = 'hidden';
    emojiPicker.style.top = '0';
    emojiPicker.style.left = '0';
    const pickerW = emojiPicker.offsetWidth;
    const pickerH = emojiPicker.offsetHeight;
    let left = window.scrollX + r.left;
    let top = window.scrollY + r.bottom + 6;
    // Right-edge clamp: prefer aligning the picker's RIGHT to the button's RIGHT
    // (so it grows leftward from the anchor when there's no room on the right).
    const vpRight = window.scrollX + window.innerWidth - 8;
    if (left + pickerW > vpRight) left = Math.max(8, (window.scrollX + r.right) - pickerW);
    // Bottom-edge clamp: if no room below, place above the button.
    const vpBottom = window.scrollY + window.innerHeight - 8;
    if (top + pickerH > vpBottom) top = window.scrollY + r.top - pickerH - 6;
    emojiPicker.style.top = top + 'px';
    emojiPicker.style.left = left + 'px';
    emojiPicker.style.visibility = '';
    emojiPicker.querySelectorAll('button').forEach(b => {
      b.onclick = async (e) => {
        e.stopPropagation();
        const emoji = b.dataset.emoji;
        closeEmojiPicker();
        await fetch('/api/reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, comment_id: targetId, emoji })
        });
        await refreshComments();
      };
    });
    setTimeout(() => {
      const closer = (ev) => {
        if (!ev.target.closest('.tdoc-emoji-picker') && !ev.target.closest('.tdoc-react-add')) {
          closeEmojiPicker();
          document.removeEventListener('click', closer);
        }
      };
      document.addEventListener('click', closer);
    }, 0);
  }

  // Find the right edge of the doc's main content. Heuristic: the largest <p>
  // / <article> / <main> / .wrap visible on screen, whichever is most likely the
  // article. Cards are placed just to the right of that, with a small gap, so
  // the article stays in its natural centered position.
  function getContentRightEdge() {
    const candidates = document.querySelectorAll('main, article, .wrap, .content, .container');
    let bestRight = 0;
    let bestWidth = 0;
    for (const el of candidates) {
      if (el.closest('.tdoc-bar, .tdoc-popup, .tdoc-margin-comment')) continue;
      const r = el.getBoundingClientRect();
      if (r.width > bestWidth && r.width > 200 && r.width < window.innerWidth) {
        bestWidth = r.width;
        bestRight = r.right;
      }
    }
    if (bestRight > 0) return bestRight + window.scrollX;
    // Fallback: pick a wide paragraph
    const ps = document.querySelectorAll('p, h1, h2, h3');
    for (const el of ps) {
      const r = el.getBoundingClientRect();
      if (r.width > bestWidth && r.width > 300 && r.width < window.innerWidth) {
        bestWidth = r.width;
        bestRight = r.right;
      }
    }
    return bestRight > 0 ? bestRight + window.scrollX : window.innerWidth - 320;
  }

  // Position each card vertically next to its anchor, stacking when they overlap.
  function repositionCards() {
    const margin = 12;
    const cardGap = 16;       // space between article right edge and the card column
    const cardWidth = 280;
    const contentRight = getContentRightEdge();
    // Card column begins right after the article (with cardGap), clamped so cards
    // never overflow the viewport.
    let cardLeft = contentRight + cardGap;
    const maxLeft = window.scrollX + window.innerWidth - cardWidth - 12;
    if (cardLeft > maxLeft) cardLeft = maxLeft;

    // Anchored cards: align with their anchor, stacking when overlap.
    const anchored = activeComments
      .map(c => ({ c, mark: anchorEls.get(c.id), card: cardEls.get(c.id) }))
      .filter(x => x.mark && x.card)
      .sort((a, b) => {
        const ra = a.mark.getBoundingClientRect();
        const rb = b.mark.getBoundingClientRect();
        return (ra.top + window.scrollY) - (rb.top + window.scrollY);
      });

    let prevBottom = 0;
    for (const { mark, card } of anchored) {
      const r = mark.getBoundingClientRect();
      let top = r.top + window.scrollY;
      if (top < prevBottom + margin) top = prevBottom + margin;
      card.style.top = top + 'px';
      card.style.left = cardLeft + 'px';
      card.classList.remove('tdoc-unanchored');
      prevBottom = top + card.offsetHeight;
    }

    // Unanchored cards (anchor text/element no longer in doc): stack at the
    // bottom under a divider so they're never visually orphaned.
    const unanchored = activeComments
      .map(c => ({ c, card: cardEls.get(c.id) }))
      .filter(x => x.card && !anchorEls.get(x.c.id));
    for (const { card } of unanchored) {
      const top = Math.max(prevBottom + 32, 100);
      card.style.top = top + 'px';
      card.style.left = cardLeft + 'px';
      card.classList.add('tdoc-unanchored');
      prevBottom = top + card.offsetHeight;
    }
  }

  function setActiveComment(id) {
    document.querySelectorAll('.tdoc-anchor-mark.active, .tdoc-margin-comment.active, .tdoc-element-outline.active').forEach(el => el.classList.remove('active'));
    if (!id) return;
    anchorEls.get(id)?.classList.add('active');
    cardEls.get(id)?.classList.add('active');
  }

  // Clicks outside any card / anchor / popup / bar clear the active state.
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || t.nodeType !== 1) return;
    if (t.closest('.tdoc-margin-comment, .tdoc-anchor-mark, .tdoc-element-outline, .tdoc-bar, .tdoc-popup, .tdoc-modal-bg, .tdoc-emoji-picker')) return;
    // Anchored elements (canvas/img/etc) also count as "anchor click" — leave active alone.
    for (const anchorEl of anchorEls.values()) {
      const target = anchorEl._targetEl || anchorEl;
      if (target && (target === t || (target.contains && target.contains(t)))) return;
    }
    setActiveComment(null);
  });

  function outlineElement(comment) {
    if (!comment.anchor || comment.anchor.kind !== 'element' || !comment.anchor.selector) return null;
    let el;
    try { el = document.querySelector(comment.anchor.selector); } catch { return null; }
    if (!el) return null;
    const outline = document.createElement('div');
    outline.className = 'tdoc-element-outline';
    outline.dataset.commentId = comment.id;
    document.body.appendChild(outline);
    const repos = () => {
      const r = el.getBoundingClientRect();
      outline.style.top = (window.scrollY + r.top - 3) + 'px';
      outline.style.left = (window.scrollX + r.left - 3) + 'px';
      outline.style.width = (r.width + 6) + 'px';
      outline.style.height = (r.height + 6) + 'px';
    };
    repos();
    outline._reposition = repos;  // attach so global reposition can call
    outline._targetEl = el;
    // Outline is passive — purely visual, no click handler.
    outline.style.pointerEvents = 'none';
    return outline;
  }

  async function refreshComments() {
    // Clear previous marks + cards + outlines
    document.querySelectorAll('.tdoc-anchor-mark').forEach(mark => {
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize?.();
    });
    document.querySelectorAll('.tdoc-element-outline:not(.pending)').forEach(el => el.remove());
    commentLayer.innerHTML = '';
    anchorEls.clear();
    cardEls.clear();

    const r = await fetch(`/api/comments?slug=${encodeURIComponent(slug)}`);
    const list = await r.json();
    activeComments = list.filter(c => c.status === 'open');
    document.body.classList.toggle('tdoc-has-comments', activeComments.length > 0);

    for (const comment of activeComments) {
      let anchorEl = null;
      const kind = comment.anchor?.kind || (comment.anchor?.text ? 'text' : null);
      if (kind === 'text') {
        anchorEl = highlightAnchor(comment);
      } else if (kind === 'element') {
        anchorEl = outlineElement(comment);
      }
      if (anchorEl) {
        anchorEls.set(comment.id, anchorEl);
        // Click anchor → activate this comment.
        // Element outlines are pointer-events:none, so attach to underlying element instead.
        const clickTarget = anchorEl.classList.contains('tdoc-element-outline')
          ? anchorEl._targetEl
          : anchorEl;
        if (clickTarget) {
          clickTarget.addEventListener('click', (e) => {
            e.stopPropagation();
            setActiveComment(comment.id);
          });
          // Show pointer cursor so the anchor looks clickable.
          if (clickTarget.style) clickTarget.style.cursor = 'pointer';
        }
      }
      const card = buildCard(comment);
      commentLayer.appendChild(card);
      cardEls.set(comment.id, card);
      // Click card → activate it (and its anchor by association).
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        setActiveComment(comment.id);
      });
    }
    // Defer reposition until layout settles.
    requestAnimationFrame(repositionCards);
  }

  function repositionAll() {
    document.querySelectorAll('.tdoc-element-outline:not(.pending)').forEach(o => o._reposition?.());
    repositionCards();
  }
  window.addEventListener('resize', () => requestAnimationFrame(repositionAll));
  window.addEventListener('scroll', () => requestAnimationFrame(repositionAll), { passive: true });
  if (window.ResizeObserver) {
    new ResizeObserver(() => repositionAll()).observe(document.body);
  }

  refreshComments();

  // --- device flow (published only) ---
  let pollTimer = null;
  async function startDeviceFlow() {
    if (!isPublished) return;
    const r = await fetch('/api/auth/device/start', { method: 'POST' });
    const data = await r.json();
    if (data.error) { alert('Sign-in error: ' + (data.message || data.error)); return; }
    showDeviceModal(data);
    window.open(data.verification_uri, '_blank');
    const interval = (data.interval || 5) * 1000;
    pollTimer = setInterval(() => pollDevice(data.device_code), interval);
  }
  function showDeviceModal(data) {
    const bg = document.createElement('div');
    bg.className = 'tdoc-modal-bg';
    bg.id = 'tdoc-device-modal';
    bg.innerHTML = `
      <div class="tdoc-modal">
        <h3>Sign in with GitHub</h3>
        <div class="step"><span class="n">1</span><span>Copy this code:</span></div>
        <div class="code" id="tdoc-user-code">${data.user_code}</div>
        <div class="step"><span class="n">2</span><span>Paste it at <b>${data.verification_uri}</b> (opened in a new tab) and approve.</span></div>
        <div class="step"><span class="n">3</span><span class="status" id="tdoc-poll-status">Waiting for you to approve…</span></div>
        <div class="actions">
          <button id="tdoc-modal-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(bg);
    document.getElementById('tdoc-user-code').onclick = () => navigator.clipboard?.writeText(data.user_code);
    document.getElementById('tdoc-modal-cancel').onclick = () => closeDeviceModal();
  }
  function closeDeviceModal() {
    const m = document.getElementById('tdoc-device-modal');
    if (m) m.remove();
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }
  async function pollDevice(device_code) {
    try {
      const r = await fetch('/api/auth/device/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code })
      });
      const data = await r.json();
      const status = document.getElementById('tdoc-poll-status');
      if (data.ok && data.identity) {
        identity = data.identity;
        closeDeviceModal();
        renderIdentity();
        refreshComments();
        return;
      }
      if (data.error === 'authorization_pending') return;
      if (data.error === 'slow_down') return;
      if (data.error === 'expired_token' || data.error === 'access_denied') {
        if (status) status.textContent = 'Code expired or denied. Try again.';
        if (pollTimer) clearInterval(pollTimer);
      }
    } catch (e) {/* keep polling */}
  }

  // --- selection-driven popup ---
  let popup = null;
  let pendingHighlight = null;  // span wrapping the selected range while popup is open

  function applyPendingHighlight(range) {
    try {
      const span = document.createElement('span');
      span.className = 'tdoc-pending-highlight';
      // surroundContents fails if range crosses element boundaries — fall back to extract+insert
      try {
        range.surroundContents(span);
      } catch {
        const frag = range.extractContents();
        span.appendChild(frag);
        range.insertNode(span);
      }
      pendingHighlight = span;
    } catch { pendingHighlight = null; }
  }
  function clearPendingHighlight() {
    if (!pendingHighlight) return;
    const parent = pendingHighlight.parentNode;
    if (parent) {
      while (pendingHighlight.firstChild) parent.insertBefore(pendingHighlight.firstChild, pendingHighlight);
      parent.removeChild(pendingHighlight);
      parent.normalize();
    }
    pendingHighlight = null;
  }
  function closePopup() {
    if (popup) { popup.remove(); popup = null; }
    clearPendingHighlight();
  }

  // Selectors for elements that can host an element-anchored comment.
  const COMMENTABLE = 'img, svg, canvas, video, pre, figure, iframe[src]';
  function isInUI(el) {
    return el.closest && el.closest('.tdoc-bar, .tdoc-popup, .tdoc-margin-comment, .tdoc-modal-bg, .tdoc-anchor-mark, .tdoc-element-outline, .tdoc-hover-outline, #tdoc-comment-layer');
  }

  document.addEventListener('mouseup', (e) => {
    if (e.target.closest('.tdoc-bar') || e.target.closest('.tdoc-margin-comment') || e.target.closest('.tdoc-popup') || e.target.closest('.tdoc-modal-bg') || e.target.closest('.tdoc-hover-outline')) return;
    // Skip if the mouseup target is itself a commentable artifact — the click
    // handler owns that case and will open the popup with an element anchor.
    if (e.target.nodeType === 1) {
      const commentable = e.target.matches?.(COMMENTABLE) ? e.target : e.target.closest?.(COMMENTABLE);
      if (commentable && !isInUI(commentable)) return;
    }
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel.toString().trim();
      // If there's a real text selection, open a comment for it.
      if (text && text.length >= 2) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const context = getContext(range, 60);
        openPopup({
          kind: 'text',
          text,
          context_before: context.before,
          context_after: context.after,
          _range: range
        }, rect);
      }
      // Otherwise: do nothing. We deliberately do NOT close an open popup here,
      // because clicking on a commentable artifact opens a popup via the click
      // handler, and that click event also fires a mouseup we'd otherwise
      // immediately reverse.
    }, 0);
  });

  // --- element-level trigger (img / svg / canvas / video / pre) ---
  function elementSelector(el) {
    // Build a stable, somewhat-unique selector path.
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) { parts.unshift(`#${CSS.escape(cur.id)}`); break; }
      const parent = cur.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (sameTag.length > 1) {
          const idx = sameTag.indexOf(cur) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(' > ');
  }
  function elementLabel(el) {
    return el.getAttribute('alt') || el.getAttribute('aria-label') || el.getAttribute('title') || el.tagName.toLowerCase();
  }

  // Hover affordance: a subtle blue dashed outline on commentable artifacts
  // so users know they can be selected. Click → opens comment popup.
  let hoverOutlineEl = null;
  function showHoverOutline(el) {
    if (hoverOutlineEl?._target === el) return;
    hideHoverOutline();
    hoverOutlineEl = document.createElement('div');
    hoverOutlineEl.className = 'tdoc-hover-outline';
    hoverOutlineEl._target = el;
    document.body.appendChild(hoverOutlineEl);
    const r = el.getBoundingClientRect();
    hoverOutlineEl.style.top = (window.scrollY + r.top - 3) + 'px';
    hoverOutlineEl.style.left = (window.scrollX + r.left - 3) + 'px';
    hoverOutlineEl.style.width = (r.width + 6) + 'px';
    hoverOutlineEl.style.height = (r.height + 6) + 'px';
  }
  function hideHoverOutline() {
    if (hoverOutlineEl) { hoverOutlineEl.remove(); hoverOutlineEl = null; }
    hideHoverHint?.();
  }
  document.addEventListener('mouseover', (e) => {
    const t = e.target;
    if (!t || t.nodeType !== 1 || isInUI(t)) { hideHoverOutline(); return; }
    const el = t.matches(COMMENTABLE) ? t : t.closest(COMMENTABLE);
    if (el && !isInUI(el)) {
      // Skip if already anchored (handled by its own click handler)
      let anchored = false;
      for (const anchorEl of anchorEls.values()) {
        const target = anchorEl._targetEl || anchorEl;
        if (target === el) { anchored = true; break; }
      }
      showHoverOutline(el);
      if (!anchored) showHoverHint?.(el);
      else hideHoverHint?.();
    } else hideHoverOutline();
  });
  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget || isInUI(e.relatedTarget)) hideHoverOutline();
  });

  // --- Drag-to-comment on artifacts (Option B) ---
  // Drag must START OUTSIDE the artifact (in surrounding whitespace) — just
  // like normal text selection where you can begin in the margin. This means
  // mousedown ON the artifact always passes through to the interactive demo
  // (Conway Play, video scrubbing, draggable charts all preserved).
  // The drag rectangle is tracked; on mouseup, if it intersects any commentable
  // element, we anchor a comment to that element.
  const DRAG_THRESHOLD = 5;
  let dragState = null;   // { x0, y0, marquee, dragged }

  function makeMarquee() {
    const m = document.createElement('div');
    m.className = 'tdoc-drag-marquee';
    document.body.appendChild(m);
    return m;
  }

  function rectsOverlap(a, b) {
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  }

  // Find the first commentable element whose page-coordinate rect overlaps the
  // given drag rectangle. Returns null if none.
  function findArtifactIntersecting(dragRect) {
    const sx = window.scrollX, sy = window.scrollY;
    for (const el of document.querySelectorAll(COMMENTABLE)) {
      if (isInUI(el)) continue;
      // Skip artifacts that already have a comment (they own their own click).
      let anchored = false;
      for (const anchorEl of anchorEls.values()) {
        if ((anchorEl._targetEl || anchorEl) === el) { anchored = true; break; }
      }
      if (anchored) continue;
      const r = el.getBoundingClientRect();
      const pageRect = { left: r.left + sx, top: r.top + sy, right: r.right + sx, bottom: r.bottom + sy };
      if (rectsOverlap(pageRect, dragRect)) return el;
    }
    return null;
  }

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const t = e.target;
    if (!t || t.nodeType !== 1 || isInUI(t)) return;
    if (t.closest('button, a, input, select, textarea, [contenteditable], [role="button"]')) return;
    // CRITICAL: must START outside any artifact. If mousedown lands on an
    // artifact (canvas/img/etc), do nothing — let the demo handle it.
    if (t.matches(COMMENTABLE) || t.closest(COMMENTABLE)) return;
    dragState = { x0: e.pageX, y0: e.pageY, marquee: null, dragged: false };
  }, true);

  document.addEventListener('mousemove', (e) => {
    if (!dragState) return;
    const dx = e.pageX - dragState.x0;
    const dy = e.pageY - dragState.y0;
    const dist = Math.hypot(dx, dy);
    if (!dragState.dragged && dist >= DRAG_THRESHOLD) {
      dragState.dragged = true;
      dragState.marquee = makeMarquee();
    }
    if (dragState.dragged && dragState.marquee) {
      const x = Math.min(dragState.x0, e.pageX);
      const y = Math.min(dragState.y0, e.pageY);
      dragState.marquee.style.left = x + 'px';
      dragState.marquee.style.top = y + 'px';
      dragState.marquee.style.width = Math.abs(dx) + 'px';
      dragState.marquee.style.height = Math.abs(dy) + 'px';
    }
  }, true);

  document.addEventListener('mouseup', (e) => {
    if (!dragState) return;
    const { x0, y0, dragged, marquee } = dragState;
    dragState = null;
    if (marquee) marquee.remove();
    if (!dragged) return;
    // Build the drag's page-coordinate rect, then find any commentable element
    // it intersects.
    const dragRect = {
      left: Math.min(x0, e.pageX),
      top: Math.min(y0, e.pageY),
      right: Math.max(x0, e.pageX),
      bottom: Math.max(y0, e.pageY),
    };
    const el = findArtifactIntersecting(dragRect);
    if (!el) return;   // drag in pure whitespace; do nothing
    e.preventDefault();
    e.stopPropagation();
    hideHoverOutline();
    const r = el.getBoundingClientRect();
    openPopup({
      kind: 'element',
      selector: elementSelector(el),
      label: elementLabel(el),
      _el: el
    }, r);
  }, true);

  // Hint text under hover outline: "drag from outside to comment"
  let hoverHint = null;
  function showHoverHint(el) {
    if (hoverHint) return;
    hoverHint = document.createElement('div');
    hoverHint.className = 'tdoc-hover-hint';
    hoverHint.textContent = 'drag from outside to comment';
    document.body.appendChild(hoverHint);
    const r = el.getBoundingClientRect();
    hoverHint.style.top = (window.scrollY + r.top + 6) + 'px';
    hoverHint.style.left = (window.scrollX + r.left + 6) + 'px';
  }
  function hideHoverHint() { if (hoverHint) { hoverHint.remove(); hoverHint = null; } }

  // --- popup (works for both text and element anchors) ---
  let pendingElementOutline = null;
  function applyPendingElementOutline(el) {
    clearPendingElementOutline();
    const r = el.getBoundingClientRect();
    pendingElementOutline = document.createElement('div');
    pendingElementOutline.className = 'tdoc-element-outline pending';
    pendingElementOutline.style.top = (window.scrollY + r.top - 3) + 'px';
    pendingElementOutline.style.left = (window.scrollX + r.left - 3) + 'px';
    pendingElementOutline.style.width = (r.width + 6) + 'px';
    pendingElementOutline.style.height = (r.height + 6) + 'px';
    document.body.appendChild(pendingElementOutline);
  }
  function clearPendingElementOutline() {
    if (pendingElementOutline) { pendingElementOutline.remove(); pendingElementOutline = null; }
  }
  const _origClosePopup = closePopup;
  closePopup = function () {
    _origClosePopup();
    clearPendingElementOutline();
  };

  function openPopup(anchor, rect) {
    closePopup();
    hideHoverOutline();
    popup = document.createElement('div');
    popup.className = 'tdoc-popup';
    const needsSignIn = isPublished && !identity;
    const anchorPreview = anchor.kind === 'text'
      ? `"${escapeHtml(anchor.text.slice(0, 80))}${anchor.text.length > 80 ? '…' : ''}"`
      : `📎 ${escapeHtml(anchor.label)}`;
    popup.innerHTML = `
      <div class="head"><span class="h">${anchorPreview}</span><span class="x">×</span></div>
      ${needsSignIn ? '<div class="signin-needed">Sign in with GitHub to comment.</div>' : ''}
      <textarea placeholder="What should change?" ${needsSignIn ? 'disabled' : ''}></textarea>
      <div class="foot">
        <span class="hint">${needsSignIn ? '' : '⌘+Enter to submit'}</span>
        <button class="submit">${needsSignIn ? 'Sign in' : 'Comment'}</button>
      </div>
    `;
    popup.style.top = (window.scrollY + rect.bottom + 8) + 'px';
    const left = Math.min(rect.left + window.scrollX, window.innerWidth - 340);
    popup.style.left = Math.max(8, left) + 'px';
    document.body.appendChild(popup);

    if (anchor.kind === 'text' && anchor._range) {
      applyPendingHighlight(anchor._range);
      window.getSelection().removeAllRanges();
    } else if (anchor.kind === 'element' && anchor._el) {
      applyPendingElementOutline(anchor._el);
    }

    const textarea = popup.querySelector('textarea');
    if (!needsSignIn) textarea.focus();
    popup.querySelector('.x').onclick = closePopup;

    const submit = async () => {
      if (needsSignIn) { closePopup(); startDeviceFlow(); return; }
      const text = textarea.value.trim();
      if (!text) return;
      // Strip internal-only fields before sending
      const sendAnchor = anchor.kind === 'text'
        ? { kind: 'text', text: anchor.text, context_before: anchor.context_before, context_after: anchor.context_after }
        : { kind: 'element', selector: anchor.selector, label: anchor.label };
      const r = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug, version,
          anchor: sendAnchor,
          text
        })
      });
      if (r.status === 401) { closePopup(); startDeviceFlow(); return; }
      await r.json().catch(() => null);
      closePopup();
      await refreshComments();
    };
    popup.querySelector('.submit').onclick = submit;
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
      if (e.key === 'Escape') closePopup();
    });
  }

  function getContext(range, chars) {
    try {
      const container = range.startContainer;
      const fullText = (container.textContent || '');
      const start = range.startOffset;
      const end = range.endOffset;
      return {
        before: fullText.slice(Math.max(0, start - chars), start),
        after: fullText.slice(end, end + chars)
      };
    } catch { return { before: '', after: '' }; }
  }

  // --- HTML → Markdown converter (no deps, ~80 lines) ---
  function htmlToMarkdown(root) {
    function walk(node, ctx) {
      if (node.nodeType === Node.TEXT_NODE) {
        let t = node.nodeValue;
        if (ctx.inPre) return t;
        // collapse whitespace
        return t.replace(/\s+/g, ' ');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      // skip our own UI
      if (node.classList && (
        node.classList.contains('tdoc-bar') ||
        node.classList.contains('tdoc-popup') ||
        node.classList.contains('tdoc-margin-comment') ||
        node.classList.contains('tdoc-modal-bg') ||
        node.classList.contains('tdoc-element-outline') ||
        node.classList.contains('tdoc-hover-outline') ||
        node.id === 'tdoc-comment-layer'
      )) return '';

      const tag = node.tagName.toLowerCase();
      const kids = () => Array.from(node.childNodes).map(c => walk(c, ctx)).join('');

      switch (tag) {
        case 'h1': return '\n\n# ' + kids().trim() + '\n\n';
        case 'h2': return '\n\n## ' + kids().trim() + '\n\n';
        case 'h3': return '\n\n### ' + kids().trim() + '\n\n';
        case 'h4': return '\n\n#### ' + kids().trim() + '\n\n';
        case 'h5': return '\n\n##### ' + kids().trim() + '\n\n';
        case 'h6': return '\n\n###### ' + kids().trim() + '\n\n';
        case 'p': return '\n\n' + kids().trim() + '\n\n';
        case 'br': return '  \n';
        case 'hr': return '\n\n---\n\n';
        case 'strong':
        case 'b': return '**' + kids() + '**';
        case 'em':
        case 'i': return '*' + kids() + '*';
        case 'code': {
          if (ctx.inPre) return kids();
          return '`' + kids() + '`';
        }
        case 'pre': {
          const c = { ...ctx, inPre: true };
          const lang = node.querySelector('code')?.className?.match(/language-([\w-]+)/)?.[1] || '';
          const inner = Array.from(node.childNodes).map(n => walk(n, c)).join('');
          return '\n\n```' + lang + '\n' + inner.replace(/\n$/, '') + '\n```\n\n';
        }
        case 'blockquote':
          return '\n\n' + kids().trim().split('\n').map(l => '> ' + l).join('\n') + '\n\n';
        case 'ul': {
          const items = Array.from(node.children).filter(c => c.tagName === 'LI');
          return '\n\n' + items.map(li => '- ' + walk(li, ctx).trim()).join('\n') + '\n\n';
        }
        case 'ol': {
          const items = Array.from(node.children).filter(c => c.tagName === 'LI');
          return '\n\n' + items.map((li, i) => (i + 1) + '. ' + walk(li, ctx).trim()).join('\n') + '\n\n';
        }
        case 'li': return kids();
        case 'a': {
          const href = node.getAttribute('href') || '';
          const text = kids().trim();
          return href ? `[${text}](${href})` : text;
        }
        case 'img': {
          const src = node.getAttribute('src') || '';
          const alt = node.getAttribute('alt') || '';
          return `![${alt}](${src})`;
        }
        case 'svg':
        case 'canvas':
        case 'video':
        case 'iframe':
          return `\n\n[${tag} embed]\n\n`;
        case 'figure': return '\n\n' + kids().trim() + '\n\n';
        case 'figcaption': return '\n\n*' + kids().trim() + '*\n\n';
        case 'table': {
          const rows = Array.from(node.querySelectorAll('tr'));
          if (!rows.length) return '';
          const cells = (r) => Array.from(r.children).map(c => walk(c, ctx).trim().replace(/\|/g, '\\|'));
          const head = cells(rows[0]);
          const body = rows.slice(1).map(cells);
          const headerLine = '| ' + head.join(' | ') + ' |';
          const sepLine = '| ' + head.map(() => '---').join(' | ') + ' |';
          const bodyLines = body.map(r => '| ' + r.join(' | ') + ' |').join('\n');
          return '\n\n' + headerLine + '\n' + sepLine + '\n' + bodyLines + '\n\n';
        }
        case 'th':
        case 'td':
        case 'tr': return kids();
        default: return kids();
      }
    }
    let md = walk(root, { inPre: false });
    // tidy: collapse 3+ blank lines, trim
    md = md.replace(/\n{3,}/g, '\n\n').trim();
    return md;
  }

  async function copyText(s) {
    try { await navigator.clipboard.writeText(s); return true; }
    catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  // Briefly morph a button into a "✓ Copied" success state, then restore.
  function flashCopied(btn) {
    if (!btn || btn.dataset.flashing === '1') return;
    btn.dataset.flashing = '1';
    const orig = btn.innerHTML;
    const origColor = btn.style.color;
    const origBorder = btn.style.borderColor;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Copied</span>`;
    btn.style.color = '#3ecf8e';
    btn.style.borderColor = '#3ecf8e';
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.color = origColor;
      btn.style.borderColor = origBorder;
      btn.dataset.flashing = '0';
    }, 1200);
  }
  // Subtle bottom-right toast fallback for non-button copies (per-comment etc.).
  function flashToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:18px;right:18px;background:#0a0a0a;color:#fff;padding:8px 14px;border-radius:6px;font:12px system-ui;z-index:1000001;opacity:0;transition:opacity 0.15s;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,0.2);';
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '0.95'; });
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 200); }, 1400);
  }

  function reactionsToMd(reactions) {
    if (!reactions) return '';
    const parts = Object.entries(reactions).filter(([, u]) => u && u.length > 0).map(([e, u]) => `${e} ${u.length}`);
    return parts.length ? `_reactions: ${parts.join(' · ')}_\n` : '';
  }
  function commentToMd(c) {
    const who = c.author ? `**@${c.author.login}**` : '*anonymous*';
    const when = new Date(c.created).toLocaleString();
    let anchorLine = '';
    if (c.anchor) {
      if (c.anchor.kind === 'element' || c.anchor.selector) anchorLine = `> _on ${c.anchor.label || c.anchor.selector}_\n`;
      else if (c.anchor.text) anchorLine = `> "${c.anchor.text.replace(/\n/g, ' ').slice(0, 200)}"\n`;
    }
    let md = `${who} — _${when}_\n${anchorLine}\n${c.text}\n${reactionsToMd(c.reactions)}`;
    if (Array.isArray(c.replies) && c.replies.length) {
      for (const r of c.replies) {
        const rwho = r.author ? `**@${r.author.login}**` : '*anonymous*';
        const rwhen = new Date(r.created).toLocaleString();
        md += `  ↳ ${rwho} — _${rwhen}_\n    ${r.text}\n    ${reactionsToMd(r.reactions)}`;
      }
    }
    return md;
  }

  // Expose for the top-bar + comment cards
  window.__tdocCopyDocMd = async function (includeComments) {
    // Clone body and strip our UI + scripts/styles before converting
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('.tdoc-bar, .tdoc-popup, .tdoc-margin-comment, .tdoc-modal-bg, .tdoc-element-outline, .tdoc-hover-outline, #tdoc-comment-layer, script, style, noscript').forEach(n => n.remove());
    let md = htmlToMarkdown(clone);
    if (includeComments && activeComments.length) {
      md += '\n\n---\n\n## Comments\n\n' + activeComments.map(commentToMd).join('\n---\n\n');
    }
    const ok = await copyText(md);
    if (ok) flashCopied(document.getElementById('tdoc-copy-md-btn'));
    else flashToast('Copy failed');
  };
  window.__tdocCopyCommentMd = async function (commentId, srcBtn) {
    const c = activeComments.find(x => x.id === commentId);
    if (!c) return;
    const ok = await copyText(commentToMd(c));
    if (ok && srcBtn) {
      const origHTML = srcBtn.innerHTML;
      const origColor = srcBtn.style.color;
      srcBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      srcBtn.style.color = '#3ecf8e';
      setTimeout(() => { srcBtn.innerHTML = origHTML; srcBtn.style.color = origColor; }, 1200);
    } else if (!ok) {
      flashToast('Copy failed');
    }
  };
})();
