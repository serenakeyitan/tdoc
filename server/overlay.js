// tdoc overlay — single-file design.
// Sections are demarcated with `// ========== Name ==========` headers so the
// file reads like several concatenated modules. Each section depends only on
// the ones above it (and on `state`). No section reaches sideways.
//
// External contract preserved verbatim:
//   - Endpoints: /api/comments, /api/reactions, /api/auth/device/start,
//     /api/auth/device/poll, /api/auth/logout, /d/<slug>/v/<n>/export
//   - Globals: window.__tdocCopyDocMd(includeComments), window.__tdocCopyCommentMd(id, btn)
//   - Body classes: tdoc-has-comments, tdoc-narrow, tdoc-doc-dark
//   - Keyboard: ⌘/Ctrl-Enter submits, Esc cancels.
//
// Highlight rendering: CSS Custom Highlight API (CSS.highlights). One named
// highlight `tdoc-pending` for the in-flight selection, and one
// `tdoc-anchor-<id>` per saved comment. This replaces the legacy
// surroundContents/extractContents path that produced empty yellow bars when
// the selection crossed block boundaries. A minimal single-textnode <span>
// fallback runs on browsers without `CSS.highlights`.

(function () {
  // ========== Config & DOM setup ==========
  const cfg = window.__TDOC__ || {};
  const { slug, version } = cfg;
  const mode = cfg.mode || 'local';
  const isPublished = mode === 'published';
  const isFork = mode === 'fork';
  const isLocal = mode === 'local';
  // Fork mode renders the doc read-only with comments mirrored from the
  // embedded #tdoc-fork-comments JSON. No /api calls, no auth, no publish.
  // The original published slug is in cfg.originalSlug so we can label it.
  let identity = cfg.identity || null;
  if (!slug) return;

  const HIGHLIGHT_API = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function';

  // Phones need this or they render at a virtual ~980px viewport.
  if (!document.querySelector('meta[name="viewport"]')) {
    const m = document.createElement('meta');
    m.name = 'viewport';
    m.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
    document.head.appendChild(m);
  }

  // Classify the doc's actual painted background. We tag `body.tdoc-doc-dark`
  // for highlight + footer colors so a white doc keeps yellow highlights even
  // when the OS is in dark mode.
  function classifyDocTheme() {
    const bg = getComputedStyle(document.body).backgroundColor || 'rgb(255,255,255)';
    const m = bg.match(/\d+/g);
    if (!m || m.length < 3) return;
    const [r, g, b] = m.map(Number);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    document.body.classList.toggle('tdoc-doc-dark', lum < 0.5);
  }
  setTimeout(classifyDocTheme, 0);

  // ========== Styles ==========
  // Each logical group is one comment block; rules within a group are tightly
  // packed. Visual modes (narrow, dark) live at the bottom and override base.
  const css = `
  /* Layout */
  body { padding-top: 44px !important; padding-bottom: 24px; -webkit-user-select: none; user-select: none; }
  body p,body h1,body h2,body h3,body h4,body h5,body h6,body li,body blockquote,body pre,body code,body figcaption,body th,body td,body dt,body dd,body summary,body span,body em,body strong,body i,body b,body u,body s,body a,body small,body sub,body sup,body mark,body textarea,body input[type="text"],body input[type="search"],body [contenteditable] { -webkit-user-select: text; user-select: text; }
  body.tdoc-has-comments:not(.tdoc-narrow) { padding-right: 320px !important; }
  body.tdoc-narrow { padding-right: 0 !important; }

  /* Top bar */
  .tdoc-bar { position: fixed; top: 0; left: 0; right: 0; height: 44px; background: #0a0a0a; color: #fff; display: flex; align-items: center; padding: 0 16px; font: 13px system-ui, sans-serif; z-index: 999999; gap: 12px; }
  .tdoc-bar .title { font-weight: 600; }
  .tdoc-bar .slug { color: #888; }
  .tdoc-bar .spacer { flex: 1; }
  .tdoc-bar button { background: transparent; border: 1px solid #2a2a2a; color: #ddd; padding: 5px 10px; border-radius: 6px; font: inherit; cursor: pointer; transition: background .12s, color .12s, border-color .12s; }
  .tdoc-bar button:hover { background: #1c1c1c; color: #fff; border-color: #444; }
  .tdoc-icon-btn { display: inline-flex; align-items: center; gap: 6px; }
  .tdoc-menu-wrap { position: relative; display: inline-block; }
  .tdoc-menu,.tdoc-secondary-menu { position: absolute; background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 8px; padding: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); display: none; z-index: 1000000; }
  .tdoc-menu { top: calc(100% + 6px); right: 0; min-width: 180px; }
  .tdoc-secondary-menu { top: 100%; right: 10px; min-width: 160px; }
  .tdoc-menu.open,.tdoc-secondary-menu.open { display: block; }
  .tdoc-menu button,.tdoc-secondary-menu button { display: block; width: 100%; text-align: left; border: none; background: transparent; color: #ddd; padding: 8px 12px; border-radius: 4px; font: 13px system-ui, sans-serif; cursor: pointer; }
  .tdoc-menu button:hover,.tdoc-secondary-menu button:hover { background: #1c1c1c; color: #fff; }
  .tdoc-bar .tdoc-secondary-toggle { display: none; background: transparent; border: 1px solid #2a2a2a; color: #ddd; padding: 5px 10px; border-radius: 6px; font: inherit; cursor: pointer; align-items: center; }
  .tdoc-bar .tdoc-secondary-toggle:hover { background: #1c1c1c; }
  .tdoc-chip { display: flex; align-items: center; gap: 8px; padding: 3px 12px 3px 3px; background: #1c1c1c; border: 1px solid #333; border-radius: 999px; cursor: pointer; color: #fff; font: inherit; }
  .tdoc-chip:hover { background: #2a2a2a; }
  .tdoc-chip img { width: 28px; height: 28px; border-radius: 50%; }
  .tdoc-chip .name { font-size: 13px; }
  .tdoc-chip.signin { padding: 6px 14px; background: #1652f0; border-color: #1652f0; }
  .tdoc-chip.signin:hover { background: #1245d0; }

  /* Comment cards */
  #tdoc-comment-layer { position: absolute; top: 0; left: 0; width: 100%; pointer-events: none; z-index: 999996; }
  .tdoc-margin-comment { position: absolute; width: 280px; background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); font: 13px system-ui, sans-serif; transition: box-shadow .15s, transform .15s; z-index: 999996; pointer-events: auto; }
  .tdoc-margin-comment.active { box-shadow: 0 4px 16px rgba(22,82,240,0.18); border-color: #1652f0; }
  .tdoc-margin-comment.tdoc-unanchored { border-style: dashed; }
  .tdoc-margin-comment.tdoc-unanchored::before { content: 'unanchored'; display: block; font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
  .tdoc-margin-comment .author { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .tdoc-margin-comment .author img { width: 24px; height: 24px; border-radius: 50%; }
  .tdoc-margin-comment .author .login { font-weight: 600; color: #111; font-size: 13px; }
  .tdoc-margin-comment .author .anon { color: #888; font-style: italic; }
  .tdoc-margin-comment .text { color: #111; line-height: 1.45; word-wrap: break-word; }
  .tdoc-margin-comment .meta { font-size: 11px; color: #888; margin-top: 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .tdoc-margin-comment .meta > span:first-child { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tdoc-margin-comment .del { cursor: pointer; color: #c33; }
  .tdoc-margin-comment .del:hover { text-decoration: underline; }
  .tdoc-margin-comment .actions { display: inline-flex; gap: 8px; align-items: center; flex-shrink: 0; }
  .tdoc-margin-comment .copy-md { cursor: pointer; color: #888; display: inline-flex; align-items: center; }
  .tdoc-margin-comment .copy-md:hover { color: #1652f0; }
  .tdoc-margin-comment .copy-md svg { width: 14px; height: 14px; display: block; }
  .tdoc-margin-comment .tdoc-reply-toggle { cursor: pointer; color: #1652f0; }
  .tdoc-margin-comment .tdoc-reply-toggle:hover { text-decoration: underline; }

  /* Reactions + emoji picker */
  .tdoc-reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; align-items: center; }
  .tdoc-react-chip { display: inline-flex; align-items: center; gap: 4px; font: 12px system-ui; background: #f5f6f8; border: 1px solid #e5e5e5; border-radius: 999px; padding: 2px 8px; cursor: pointer; color: #333; transition: background .12s, border-color .12s; }
  .tdoc-react-chip:hover { background: #eef0f3; }
  .tdoc-react-chip.mine { background: #e8eeff; border-color: #1652f0; color: #1652f0; }
  .tdoc-react-add { background: transparent; border: none; color: #aaa; padding: 0; cursor: pointer; line-height: 1; transition: color .12s, opacity .12s; display: inline-flex; align-items: center; }
  .tdoc-react-add svg { width: 16px; height: 16px; display: block; }
  .tdoc-reactions .tdoc-react-add { opacity: 0; padding: 2px 4px; }
  .tdoc-margin-comment:hover .tdoc-reactions .tdoc-react-add, .tdoc-reply:hover .tdoc-reactions .tdoc-react-add, .tdoc-reactions:has(.tdoc-react-chip) .tdoc-react-add { opacity: 1; }
  .tdoc-react-add.inline svg { width: 14px; height: 14px; }
  .tdoc-react-add.inline { opacity: 0.55; vertical-align: middle; }
  .tdoc-react-add:hover { color: #1652f0; opacity: 1; }
  .tdoc-emoji-picker { position: absolute; background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 6px; display: grid; grid-template-columns: repeat(6, 32px); gap: 2px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); z-index: 1000001; }
  .tdoc-emoji-picker button { background: transparent; border: none; padding: 0; cursor: pointer; border-radius: 4px; width: 32px; height: 32px; font-size: 18px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
  .tdoc-emoji-picker button:hover { background: #f5f6f8; }
  .tdoc-emoji-picker button.tdoc-emoji-text { grid-column: span 6; height: auto; padding: 6px 8px; font-size: 12px; font-weight: 600; color: #1652f0; }
  .tdoc-emoji-picker button.tdoc-emoji-text:hover { background: #e8eeff; }

  /* Replies + reply form */
  .tdoc-replies-toggle { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #eee; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; font-size: 12px; color: #1652f0; user-select: none; }
  .tdoc-replies-toggle:hover { text-decoration: underline; }
  .tdoc-replies-toggle .chev { transition: transform .15s; }
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
  .tdoc-reply-form { display: none; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #eee; }
  .tdoc-reply-form.open { display: block; }
  .tdoc-reply-form textarea { width: 100%; min-height: 48px; box-sizing: border-box; padding: 6px 8px; font: 13px system-ui; border: 1px solid #ccc; border-radius: 6px; resize: vertical; outline: none; }
  .tdoc-reply-form textarea:focus { border-color: #1652f0; }
  .tdoc-reply-form-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
  .tdoc-reply-form-foot .hint { color: #888; font-size: 11px; }
  .tdoc-reply-form-foot .tdoc-reply-submit { background: #1652f0; color: #fff; border: none; border-radius: 6px; padding: 5px 12px; font: 12px system-ui; cursor: pointer; }
  .tdoc-reply-form-foot .tdoc-reply-submit:hover { background: #1245d0; }

  /* Anchor highlights (Custom Highlight API + fallback span) */
  ::highlight(tdoc-pending) { background-color: #fff3a8; }
  ::highlight(tdoc-anchor) { background-color: #fff7d0; }
  /* Active = clicked. Visibly different from resting: vivid yellow + thick
     gold underline. (The CSS Highlight API only supports background-color,
     color, and text-decoration — so we stack those.) */
  ::highlight(tdoc-anchor-active) {
    background-color: #ffd84d;
    text-decoration: underline solid #b8860b;
    text-decoration-thickness: 3px;
    text-underline-offset: 2px;
  }
  .tdoc-anchor-mark { background: #fff7d0; cursor: pointer; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  .tdoc-anchor-mark:hover { background: #fdedb0; }
  .tdoc-anchor-mark.active { background: #ffd84d; box-shadow: 0 -3px 0 -1px #b8860b inset; }

  /* Element outlines + hover affordance */
  .tdoc-element-outline { position: absolute; pointer-events: none; border: 1.5px solid rgba(22,82,240,0.35); border-radius: 4px; box-sizing: border-box; z-index: 999995; transition: border-color .15s, box-shadow .15s, border-width .15s; }
  .tdoc-element-outline.pending { border-color: #f0d000; border-width: 2px; background: transparent; }
  .tdoc-element-outline.active { border-color: #1652f0; border-width: 2px; box-shadow: 0 0 0 4px rgba(22,82,240,0.18); }
  .tdoc-hover-outline { position: absolute; pointer-events: none; z-index: 999995; border: 2px dashed #1652f0; border-radius: 4px; background: rgba(22,82,240,0.06); box-sizing: border-box; transition: opacity .12s; }
  /* Clickable pill that appears NEXT TO commentable artifacts (img/canvas/svg/video/pre).
     Positioned just outside the artifact's right edge so it can't obscure
     content. Uses !important on the visible colors to defend against doc-side
     button:hover rules that would otherwise repaint our background. */
  .tdoc-comment-pill {
    position: absolute !important; z-index: 999998 !important;
    background: #1652f0 !important; color: #fff !important;
    font: 600 12px system-ui !important;
    padding: 6px 12px !important;
    border: none !important; border-radius: 999px !important;
    cursor: pointer !important;
    box-shadow: 0 2px 10px rgba(22,82,240,0.45) !important;
    display: inline-flex !important; align-items: center !important; gap: 5px !important;
    transition: transform .12s, background-color .12s, box-shadow .12s !important;
    line-height: 1 !important;
    text-decoration: none !important;
    /* Make sure no doc reset can hide it */
    opacity: 1 !important; visibility: visible !important;
  }
  .tdoc-comment-pill:hover {
    background: #1245d0 !important; color: #fff !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 4px 14px rgba(22,82,240,0.55) !important;
  }
  .tdoc-comment-pill:active { background: #0f3bb0 !important; transform: translateY(0) !important; }
  .tdoc-comment-pill svg { width: 13px !important; height: 13px !important; flex-shrink: 0 !important; stroke: #fff !important; }
  .tdoc-drag-marquee { position: absolute; pointer-events: none; z-index: 999997; border: 1.5px solid #1652f0; background: rgba(22,82,240,0.1); box-sizing: border-box; }

  /* Popup (new-comment) */
  .tdoc-popup { position: absolute; background: #0a0a0a; color: #fff; border-radius: 10px; padding: 14px; width: 320px; box-shadow: 0 12px 40px rgba(0,0,0,0.4); z-index: 999998; font: 13px system-ui, sans-serif; }
  .tdoc-popup .head { display: flex; justify-content: space-between; margin-bottom: 8px; }
  .tdoc-popup .head .h { color: #aaa; }
  .tdoc-popup .head .x { cursor: pointer; color: #888; }
  .tdoc-popup textarea { width: 100%; min-height: 64px; background: transparent; color: #fff; border: 1px solid #1652f0; border-radius: 6px; padding: 8px; font: inherit; resize: vertical; box-sizing: border-box; outline: none; }
  .tdoc-popup .foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
  .tdoc-popup .hint { color: #888; font-size: 11px; }
  .tdoc-popup .submit { background: #1652f0; border: none; color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font: inherit; font-weight: 500; }
  .tdoc-popup .submit:hover { background: #1245d0; }
  .tdoc-popup .signin-needed { color: #f5a623; font-size: 12px; padding: 8px 0; }

  /* Modal (sign-in) */
  .tdoc-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 1000000; display: flex; align-items: center; justify-content: center; font: 14px system-ui, sans-serif; }
  .tdoc-modal { background: #fff; color: #111; border-radius: 12px; padding: 28px; width: 460px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
  .tdoc-modal h3 { margin: 0 0 8px; font-size: 20px; }
  .tdoc-modal p { margin: 0 0 14px; color: #444; line-height: 1.5; }
  .tdoc-modal .code { background: #0a0a0a; color: #fff; padding: 18px; border-radius: 8px; font: 24px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 0.15em; text-align: center; margin: 0 0 14px; user-select: all; cursor: copy; }
  .tdoc-modal .step { display: flex; gap: 10px; margin-bottom: 8px; color: #444; }
  .tdoc-modal .step .n { width: 22px; height: 22px; border-radius: 50%; background: #1652f0; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
  .tdoc-modal .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  .tdoc-modal button { padding: 8px 16px; border-radius: 6px; font: inherit; cursor: pointer; border: 1px solid #ccc; background: #fff; }
  .tdoc-modal button.primary { background: #1652f0; border-color: #1652f0; color: #fff; }
  .tdoc-modal button.primary:hover { background: #1245d0; }
  .tdoc-modal .status { color: #888; font-size: 13px; }

  /* Narrow mode (drawer + FAB) */
  body.tdoc-narrow .tdoc-bar .slug, body.tdoc-narrow .tdoc-bar #tdoc-fork-btn, body.tdoc-narrow .tdoc-bar #tdoc-home-btn, body.tdoc-narrow .tdoc-bar #tdoc-publish-btn, body.tdoc-narrow .tdoc-bar #tdoc-share-btn, body.tdoc-narrow .tdoc-bar #tdoc-saveas-btn { display: none; }
  body.tdoc-narrow .tdoc-bar .tdoc-secondary-toggle { display: inline-flex; }
  body.tdoc-narrow .tdoc-bar .title { font-size: 13px; max-width: 50vw; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.tdoc-narrow .tdoc-chip .name { display: none; }
  body.tdoc-narrow .tdoc-chip { padding: 3px; }
  body.tdoc-narrow .tdoc-chip.signin { padding: 6px 10px; font-size: 12px; }
  body.tdoc-narrow .tdoc-chip.signin .name { display: inline; }
  body.tdoc-narrow #tdoc-comment-layer { position: fixed; top: auto; left: 0; right: 0; bottom: 0; max-height: 70vh; width: 100%; pointer-events: auto; background: #fff; border-top: 1px solid #e5e5e5; box-shadow: 0 -4px 24px rgba(0,0,0,0.08); transform: translateY(100%); transition: transform .2s; overflow-y: auto; padding: 12px 12px 24px; box-sizing: border-box; z-index: 999998; }
  body.tdoc-narrow #tdoc-comment-layer.open { transform: translateY(0); }
  body.tdoc-narrow #tdoc-comment-layer .tdoc-drawer-handle { display: block; width: 36px; height: 4px; background: #ccc; border-radius: 2px; margin: 0 auto 12px; cursor: grab; touch-action: none; user-select: none; }
  body.tdoc-narrow #tdoc-comment-layer .tdoc-drawer-handle:active { cursor: grabbing; }
  body.tdoc-narrow .tdoc-margin-comment { position: static !important; width: auto !important; left: auto !important; top: auto !important; margin-bottom: 10px; transform: none !important; }
  body.tdoc-narrow .tdoc-fab { position: fixed; bottom: 16px; right: 16px; z-index: 999997; background: #1652f0; color: #fff; border: none; border-radius: 999px; padding: 10px 16px; font: 13px system-ui; font-weight: 600; box-shadow: 0 4px 16px rgba(22,82,240,0.35); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
  body.tdoc-narrow .tdoc-fab:active { transform: scale(0.96); }
  body.tdoc-narrow .tdoc-popup { width: calc(100vw - 24px); max-width: 320px; left: 12px !important; }
  body.tdoc-narrow .tdoc-modal { width: calc(100vw - 32px); padding: 20px; }
  body.tdoc-narrow .tdoc-modal .code { font-size: 20px; }
  body.tdoc-narrow .tdoc-hover-outline, body.tdoc-narrow .tdoc-comment-pill, body.tdoc-narrow .tdoc-drag-marquee { display: none; }
  body.tdoc-narrow .tdoc-emoji-picker { grid-template-columns: repeat(6, 36px); }
  body.tdoc-narrow .tdoc-emoji-picker button { width: 36px; height: 36px; font-size: 20px; }
  @media (max-width: 480px) {
    .tdoc-bar { padding: 0 10px; gap: 8px; }
    .tdoc-bar button, .tdoc-bar .tdoc-menu-wrap > button { padding: 4px 8px; font-size: 12px; }
    .tdoc-icon-btn span { display: none; }
    .tdoc-emoji-picker { grid-template-columns: repeat(5, 40px); padding: 8px; }
    .tdoc-emoji-picker button { width: 40px; height: 40px; font-size: 22px; }
    .tdoc-emoji-picker button.tdoc-emoji-text { grid-column: span 5; }
  }

  /* Footer */
  .tdoc-footer { margin-top: 80px; padding: 20px 16px 28px; font: 12px system-ui, sans-serif; color: #888; text-align: center; border-top: 1px solid #eee; box-sizing: border-box; max-width: 100%; }
  .tdoc-footer .tdoc-footer-row { display: inline-flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center; row-gap: 4px; }
  .tdoc-footer a { color: #666; text-decoration: none; }
  .tdoc-footer a:hover { color: #1652f0; text-decoration: underline; }
  .tdoc-footer .sep { color: #ccc; }
  @media (max-width: 700px) { .tdoc-footer .tdoc-footer-row { flex-direction: column; gap: 4px; } .tdoc-footer .sep { display: none; } }

  /* Dark mode (OS preference) + doc-dark (per-doc classification) */
  body.tdoc-doc-dark ::highlight(tdoc-pending) { background-color: #8a7400; }
  body.tdoc-doc-dark ::highlight(tdoc-anchor) { background-color: #5e4f00; }
  body.tdoc-doc-dark ::highlight(tdoc-anchor-active) {
    background-color: #c79900;
    text-decoration: underline solid #ffd84d;
    text-decoration-thickness: 3px;
    text-underline-offset: 2px;
  }
  body.tdoc-doc-dark .tdoc-anchor-mark { background: #5e4f00; color: inherit; }
  body.tdoc-doc-dark .tdoc-anchor-mark:hover { background: #7a6700; }
  body.tdoc-doc-dark .tdoc-anchor-mark.active { background: #c79900; box-shadow: 0 -3px 0 -1px #ffd84d inset; }
  body.tdoc-doc-dark .tdoc-footer { color: #777; border-top-color: #2a2a2a; }
  body.tdoc-doc-dark .tdoc-footer a { color: #999; }
  body.tdoc-doc-dark .tdoc-footer a:hover { color: #8ab0ff; }
  body.tdoc-doc-dark .tdoc-footer .sep { color: #3a3a3a; }
  @media (prefers-color-scheme: dark) {
    .tdoc-margin-comment { background: #161616; border-color: #2a2a2a; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
    .tdoc-margin-comment.active { box-shadow: 0 4px 16px rgba(22,82,240,0.35); border-color: #1652f0; }
    .tdoc-margin-comment.tdoc-unanchored::before { color: #777; }
    .tdoc-margin-comment .author .login, .tdoc-margin-comment .text { color: #e5e5e5; }
    .tdoc-margin-comment .author .anon, .tdoc-margin-comment .meta, .tdoc-margin-comment .copy-md { color: #888; }
    .tdoc-margin-comment .del, .tdoc-reply .del { color: #ff6b6b; }
    .tdoc-margin-comment .copy-md:hover, .tdoc-margin-comment .tdoc-reply-toggle, .tdoc-replies-toggle, .tdoc-emoji-picker button.tdoc-emoji-text, .tdoc-react-add:hover { color: #4a8cff; }
    .tdoc-react-chip { background: #1f1f1f; border-color: #2e2e2e; color: #d0d0d0; }
    .tdoc-react-chip:hover { background: #262626; }
    .tdoc-react-chip.mine { background: rgba(22,82,240,0.18); border-color: #1652f0; color: #8ab0ff; }
    .tdoc-react-add { color: #777; }
    .tdoc-emoji-picker { background: #161616; border-color: #2a2a2a; box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
    .tdoc-emoji-picker button:hover { background: #262626; }
    .tdoc-emoji-picker button.tdoc-emoji-text:hover { background: rgba(22,82,240,0.18); }
    .tdoc-replies-toggle { border-top-color: #2a2a2a; }
    .tdoc-reply { border-left-color: #2a2a2a; }
    .tdoc-reply .author .login { color: #e5e5e5; }
    .tdoc-reply .author .anon, .tdoc-reply .meta { color: #888; }
    .tdoc-reply .text { color: #d0d0d0; }
    .tdoc-reply-form { border-top-color: #2a2a2a; }
    .tdoc-reply-form textarea { background: #0f0f0f; color: #e5e5e5; border-color: #2a2a2a; }
    .tdoc-reply-form textarea:focus { border-color: #1652f0; }
    .tdoc-modal { background: #161616; color: #e5e5e5; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
    .tdoc-modal p, .tdoc-modal .step { color: #b8b8b8; }
    .tdoc-modal button { background: #1f1f1f; border-color: #2a2a2a; color: #e5e5e5; }
    .tdoc-modal button.primary { background: #1652f0; border-color: #1652f0; color: #fff; }
    .tdoc-modal .status { color: #888; }
    body.tdoc-narrow #tdoc-comment-layer { background: #0f0f0f; border-top-color: #2a2a2a; box-shadow: 0 -4px 24px rgba(0,0,0,0.6); }
    body.tdoc-narrow #tdoc-comment-layer .tdoc-drawer-handle { background: #444; }
  }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ========== State ==========
  const state = {
    activeComments: [],            // last-fetched open comments
    cardEls: new Map(),            // id -> card element
    anchorMarks: new Map(),        // id -> { kind, el? (fallback span or outline), ranges? (Highlight API), targetEl? }
    activeId: null,
    narrow: false,
  };

  // Highlight API: one shared registry for pending, one per saved comment.
  const pendingHighlight = HIGHLIGHT_API ? new Highlight() : null;
  if (HIGHLIGHT_API) {
    CSS.highlights.set('tdoc-pending', pendingHighlight);
  }
  function setCommentHighlight(id, ranges, active) {
    if (!HIGHLIGHT_API) return;
    const name = `tdoc-anchor-${id}`;
    CSS.highlights.delete(name);
    if (!ranges || !ranges.length) return;
    const h = new Highlight(...ranges);
    h.priority = active ? 2 : 1;
    CSS.highlights.set(name, h);
    // Also register under the shared 'tdoc-anchor' / 'tdoc-anchor-active' so the
    // single ::highlight() rule paints it. We use a per-id name only so we can
    // independently delete.
    rebuildSharedHighlights();
  }
  function rebuildSharedHighlights() {
    if (!HIGHLIGHT_API) return;
    const idle = new Highlight();
    const active = new Highlight();
    for (const [id, mark] of state.anchorMarks) {
      if (!mark.ranges) continue;
      const target = (id === state.activeId) ? active : idle;
      for (const r of mark.ranges) target.add(r);
    }
    CSS.highlights.set('tdoc-anchor', idle);
    CSS.highlights.set('tdoc-anchor-active', active);
  }
  function clearAllCommentHighlights() {
    if (!HIGHLIGHT_API) return;
    for (const id of state.anchorMarks.keys()) {
      CSS.highlights.delete(`tdoc-anchor-${id}`);
    }
    CSS.highlights.delete('tdoc-anchor');
    CSS.highlights.delete('tdoc-anchor-active');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ========== Top bar ==========
  const bar = document.createElement('div');
  bar.className = 'tdoc-bar';
  // Title differs in fork mode so the user can see what they're looking at.
  const slugLabel = isFork
    ? `fork of ${cfg.originalSlug || slug} · v${version}`
    : `${slug} · v${version}${isPublished ? ' · published' : ''}`;
  // Publish/Share button: "Publish" in local, "Share" in published, hidden in fork.
  const publishShareBtnHtml = isFork ? '' : (isPublished
    ? `<button id="tdoc-share-btn" class="tdoc-icon-btn" title="Share link" aria-label="Share">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
         <span>Share</span>
       </button>`
    : `<button id="tdoc-publish-btn" class="tdoc-icon-btn" title="Publish to your Worker" aria-label="Publish">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/></svg>
         <span>Publish</span>
       </button>`);
  // Fork button: shown only on published docs. Fork mode shows "Save copy" instead.
  const forkBtnHtml = isPublished
    ? '<button id="tdoc-fork-btn">Fork</button>'
    : (isFork ? '<button id="tdoc-saveas-btn">Save As New Local Doc</button>' : '');
  bar.innerHTML = `
    <span class="title" id="tdoc-title">tdoc</span>
    <span class="slug">${slugLabel}</span>
    <span class="spacer"></span>
    ${publishShareBtnHtml}
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
    ${forkBtnHtml}
    <button id="tdoc-home-btn">All docs</button>
    <button class="tdoc-secondary-toggle" id="tdoc-more-btn" aria-label="More" title="More">⋯</button>
    <span id="tdoc-identity-slot"></span>
    <div class="tdoc-secondary-menu" id="tdoc-secondary-menu">
      ${isPublished ? '<button data-action="share">Share</button><button data-action="fork">Fork</button>' : ''}
      ${isLocal ? '<button data-action="publish">Publish</button>' : ''}
      ${isFork ? '<button data-action="saveas">Save copy</button>' : ''}
      <button data-action="home">All docs</button>
    </div>
  `;
  document.body.appendChild(bar);

  const titleEl = document.querySelector('title');
  if (titleEl && titleEl.textContent) document.getElementById('tdoc-title').textContent = titleEl.textContent;

  document.getElementById('tdoc-home-btn').onclick = () => location.href = '/';

  // Fork: opens the renderable /fork view in a new tab AND triggers a download
  // (one click, both happen). We use a hidden iframe to fire the download so
  // the user keeps focus on the new fork tab.
  function forkAndDownload() {
    const base = `/d/${encodeURIComponent(slug)}/v/${version}`;
    window.open(`${base}/fork`, '_blank');
    // hidden iframe → triggers the attachment download w/o stealing focus
    const f = document.createElement('iframe');
    f.style.display = 'none';
    f.src = `${base}/export?download=1`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 8000);
  }
  if (isPublished) {
    const fb = document.getElementById('tdoc-fork-btn');
    if (fb) fb.onclick = forkAndDownload;
    const sb = document.getElementById('tdoc-share-btn');
    if (sb) sb.onclick = (e) => { e.stopPropagation(); showShareModal(); };
  }
  if (isLocal) {
    const pb = document.getElementById('tdoc-publish-btn');
    if (pb) pb.onclick = (e) => { e.stopPropagation(); showPublishModal(); };
  }
  if (isFork) {
    // Save As: same download as Fork, but from within fork mode (no /fork open
    // since we ARE the fork tab already).
    const sa = document.getElementById('tdoc-saveas-btn');
    if (sa) sa.onclick = () => {
      const a = document.createElement('a');
      a.href = `/d/${encodeURIComponent(slug)}/v/${version}/export?download=1`;
      a.download = `${slug}-v${version}-fork.html`;
      document.body.appendChild(a); a.click(); a.remove();
    };
  }

  const copyBtn = document.getElementById('tdoc-copy-md-btn');
  const copyMenu = document.getElementById('tdoc-copy-md-menu');
  copyBtn.onclick = (e) => { e.stopPropagation(); copyMenu.classList.toggle('open'); };
  copyMenu.querySelectorAll('button').forEach(b => {
    b.onclick = async (e) => {
      e.stopPropagation();
      copyMenu.classList.remove('open');
      await window.__tdocCopyDocMd(b.dataset.mode === 'doc-comments');
    };
  });

  const moreBtn = document.getElementById('tdoc-more-btn');
  const secMenu = document.getElementById('tdoc-secondary-menu');
  moreBtn.onclick = (e) => { e.stopPropagation(); secMenu.classList.toggle('open'); };
  secMenu.querySelectorAll('button').forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      secMenu.classList.remove('open');
      if (b.dataset.action === 'home') location.href = '/';
      if (b.dataset.action === 'fork') forkAndDownload();
      if (b.dataset.action === 'share') showShareModal();
      if (b.dataset.action === 'publish') showPublishModal();
      if (b.dataset.action === 'saveas') {
        const a = document.createElement('a');
        a.href = `/d/${encodeURIComponent(slug)}/v/${version}/export?download=1`;
        a.download = `${slug}-v${version}-fork.html`;
        document.body.appendChild(a); a.click(); a.remove();
      }
    };
  });

  function renderIdentity() {
    const slot = document.getElementById('tdoc-identity-slot');
    if (!isPublished) { slot.innerHTML = ''; return; }
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

  // ========== Comment layer + FAB ==========
  const commentLayer = document.createElement('div');
  commentLayer.id = 'tdoc-comment-layer';
  const drawerHandle = document.createElement('div');
  drawerHandle.className = 'tdoc-drawer-handle';
  drawerHandle.setAttribute('aria-label', 'Drag down to close comments');
  commentLayer.appendChild(drawerHandle);
  document.body.appendChild(commentLayer);

  const fab = document.createElement('button');
  fab.className = 'tdoc-fab';
  fab.style.display = 'none';
  fab.innerHTML = '💬 <span id="tdoc-fab-count">0</span>';
  fab.onclick = (e) => { e.stopPropagation(); commentLayer.classList.toggle('open'); };
  document.body.appendChild(fab);

  // Drawer drag-to-close
  drawerHandle.onclick = (e) => { e.stopPropagation(); commentLayer.classList.remove('open'); };
  let drag = null;
  function dragStart(e) {
    e.preventDefault();
    drag = { y0: e.touches ? e.touches[0].clientY : e.clientY, dy: 0 };
    commentLayer.style.transition = 'none';
  }
  function dragMove(e) {
    if (!drag) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    drag.dy = Math.max(0, y - drag.y0);
    commentLayer.style.transform = `translateY(${drag.dy}px)`;
  }
  function dragEnd() {
    if (!drag) return;
    commentLayer.style.transition = '';
    commentLayer.style.transform = '';
    if (drag.dy > 40) commentLayer.classList.remove('open');
    drag = null;
  }
  drawerHandle.addEventListener('touchstart', dragStart, { passive: false });
  drawerHandle.addEventListener('touchmove', dragMove, { passive: true });
  drawerHandle.addEventListener('touchend', dragEnd);
  drawerHandle.addEventListener('mousedown', (e) => {
    dragStart(e);
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', function onUp() {
      dragEnd();
      document.removeEventListener('mousemove', dragMove);
      document.removeEventListener('mouseup', onUp);
    });
  });

  // ========== Footer ==========
  const footer = document.createElement('footer');
  footer.className = 'tdoc-footer';
  footer.innerHTML =
    '<div class="tdoc-footer-row">' +
      '<a href="https://github.com/serenakeyitan/tdoc" target="_blank" rel="noopener">github.com/serenakeyitan/tdoc</a>' +
      '<span class="sep">·</span>' +
      '<span>built with <a href="https://github.com/serenakeyitan/tdoc" target="_blank" rel="noopener">tdoc</a></span>' +
      '<span class="sep">·</span>' +
      '<span>inspired by <a href="https://x.com/jessepollak/status/2054313757543964857" target="_blank" rel="noopener">bdocs by @jessepollak</a></span>' +
    '</div>';
  document.body.appendChild(footer);

  // ========== Anchor matching (text → Range, element → Element) ==========
  // Find the best Range matching anchor.text. Walks all text nodes outside our
  // own UI, ranks candidates by context_before/after fit.
  function findTextRange(anchor) {
    if (!anchor || !anchor.text || anchor.text.length < 2) return null;
    const needle = anchor.text;
    const before = anchor.context_before || '';
    const after = anchor.context_after || '';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.parentElement) return NodeFilter.FILTER_REJECT;
        if (n.parentElement.closest('.tdoc-bar, .tdoc-popup, .tdoc-modal-bg, #tdoc-comment-layer, .tdoc-footer')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let best = null, bestScore = -1;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const idx = node.nodeValue.indexOf(needle);
      if (idx === -1) continue;
      const beforeSlice = node.nodeValue.slice(Math.max(0, idx - before.length), idx);
      const afterStart = idx + needle.length;
      const afterSlice = node.nodeValue.slice(afterStart, afterStart + after.length);
      let score = 0;
      if (before && beforeSlice.endsWith(before.slice(-Math.min(20, before.length)))) score += 2;
      if (after && afterSlice.startsWith(after.slice(0, Math.min(20, after.length)))) score += 2;
      if (score > bestScore) { best = { node, idx }; bestScore = score; }
    }
    if (!best) return null;
    const range = document.createRange();
    range.setStart(best.node, best.idx);
    range.setEnd(best.node, best.idx + needle.length);
    return range;
  }
  function findElement(anchor) {
    if (!anchor || !anchor.selector) return null;
    try { return document.querySelector(anchor.selector); } catch { return null; }
  }

  // Fallback span path — only used when CSS.highlights is unavailable AND the
  // range is single-text-node (no cross-element risk → no empty bars).
  function fallbackWrapAsSpan(comment, range) {
    if (range.startContainer !== range.endContainer || range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    const mark = document.createElement('span');
    mark.className = 'tdoc-anchor-mark';
    mark.dataset.commentId = comment.id;
    try { range.surroundContents(mark); return mark; } catch { return null; }
  }
  function unwrapFallbackSpans() {
    document.querySelectorAll('.tdoc-anchor-mark').forEach(mark => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize?.();
    });
  }

  // ========== Reactions + comment cards ==========
  const QUICK_EMOJIS = ['👍', '❤️', '🔥', '🎉', '😂', '🤔', '👀', '🚀', '✅', '❌', '❓', '❗'];
  const QUICK_TEXT_REACTIONS = ['LGTM'];
  const REACT_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/><line x1="19" y1="6" x2="19" y2="10"/><line x1="21" y1="8" x2="17" y2="8"/></svg>`;

  function renderAuthor(author) {
    if (author) return `<div class="author"><img src="${author.avatar_url}" alt=""><span class="login">${escapeHtml(author.login)}</span></div>`;
    return `<div class="author"><span class="anon">anonymous</span></div>`;
  }
  function renderReactionsRow(target) {
    const reactions = target.reactions || {};
    const me = identity?.login || 'anon';
    const entries = Object.entries(reactions).filter(([, u]) => u && u.length > 0);
    if (!entries.length) return '';
    const chips = entries.map(([emoji, users]) => {
      const mine = users.includes(me);
      return `<span class="tdoc-react-chip${mine ? ' mine' : ''}" data-emoji="${escapeHtml(emoji)}" data-target-id="${target.id}" title="${users.map(escapeHtml).join(', ')}">${emoji} ${users.length}</span>`;
    }).join('');
    return `<div class="tdoc-reactions" data-target-id="${target.id}">${chips}<button class="tdoc-react-add" data-target-id="${target.id}" title="Add reaction" aria-label="Add reaction">${REACT_ICON_SVG}</button></div>`;
  }
  function renderReactInline(target) {
    return `<button class="tdoc-react-add inline" data-target-id="${target.id}" title="Add reaction" aria-label="Add reaction">${REACT_ICON_SVG}</button>`;
  }
  function renderReply(reply) {
    const canDelete = !isFork && (!isPublished || (identity && reply.author && identity.login === reply.author.login));
    const hasReactions = reply.reactions && Object.values(reply.reactions).some(u => u && u.length > 0);
    return `<div class="tdoc-reply" data-comment-id="${reply.id}">
      ${renderAuthor(reply.author)}
      <div class="text">${escapeHtml(reply.text)}</div>
      ${hasReactions ? renderReactionsRow(reply) : ''}
      <div class="meta">
        <span>${new Date(reply.created).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        <span class="actions">
          ${!hasReactions && !isFork ? renderReactInline(reply) : ''}
          ${canDelete ? `<span class="del" data-id="${reply.id}">delete</span>` : ''}
        </span>
      </div>
    </div>`;
  }
  function buildCard(comment) {
    const card = document.createElement('div');
    card.className = 'tdoc-margin-comment';
    card.dataset.commentId = comment.id;
    const canDelete = !isFork && (!isPublished || (identity && comment.author && identity.login === comment.author.login));
    const replies = Array.isArray(comment.replies) ? comment.replies : [];
    const hasReactions = comment.reactions && Object.values(comment.reactions).some(u => u && u.length > 0);
    card.innerHTML = `
      ${renderAuthor(comment.author)}
      <div class="text">${escapeHtml(comment.text)}</div>
      ${hasReactions ? renderReactionsRow(comment) : ''}
      <div class="meta">
        <span>v${comment.version} · ${new Date(comment.created).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        <span class="actions">
          ${!hasReactions && !isFork ? renderReactInline(comment) : ''}
          ${isFork ? '' : `<span class="tdoc-reply-toggle" data-id="${comment.id}">Reply</span>`}
          <span class="copy-md" data-id="${comment.id}" title="Copy as Markdown" aria-label="Copy as Markdown"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>
          ${canDelete ? `<span class="del" data-id="${comment.id}">delete</span>` : ''}
        </span>
      </div>
      ${replies.length ? `
        <div class="tdoc-replies-toggle" data-id="${comment.id}">
          <svg class="chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}
        </div>
        <div class="tdoc-replies">${replies.map(r => renderReply(r)).join('')}</div>
      ` : ''}
      ${isFork ? '' : `<div class="tdoc-reply-form" data-parent-id="${comment.id}">
        <textarea placeholder="Reply…"></textarea>
        <div class="tdoc-reply-form-foot">
          <span class="hint">⌘+Enter to submit · Esc to cancel</span>
          <button class="tdoc-reply-submit">Reply</button>
        </div>
      </div>`}
    `;

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

    const copyMdBtn = card.querySelector('.copy-md');
    if (copyMdBtn) copyMdBtn.onclick = (e) => { e.stopPropagation(); window.__tdocCopyCommentMd(comment.id, copyMdBtn); };

    card.querySelectorAll('.del').forEach(del => {
      del.onclick = async (e) => {
        e.stopPropagation();
        await fetch(`/api/comments?slug=${encodeURIComponent(slug)}&id=${del.dataset.id}`, { method: 'DELETE' });
        refreshComments();
      };
    });

    const replyToggle = card.querySelector('.tdoc-reply-toggle');
    const replyForm = card.querySelector('.tdoc-reply-form');
    if (replyToggle && replyForm) {
      replyToggle.onclick = (e) => {
        e.stopPropagation();
        if (isPublished && !identity) { startDeviceFlow(); return; }
        replyForm.classList.toggle('open');
        if (replyForm.classList.contains('open')) {
          replyForm.querySelector('textarea').focus();
          requestAnimationFrame(repositionCards);
        }
      };
      const replyTa = replyForm.querySelector('textarea');
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
      replyForm.querySelector('.tdoc-reply-submit').onclick = (e) => { e.stopPropagation(); submitReply(); };
      replyTa.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitReply(); }
        if (e.key === 'Escape') { replyForm.classList.remove('open'); requestAnimationFrame(repositionCards); }
      });
    }

    card.querySelectorAll('.tdoc-react-chip').forEach(chip => {
      chip.onclick = async (e) => {
        e.stopPropagation();
        if (isFork) return; // read-only mode
        if (isPublished && !identity) { startDeviceFlow(); return; }
        await fetch('/api/reactions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
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

    card.addEventListener('click', (e) => { e.stopPropagation(); setActiveComment(comment.id); });
    return card;
  }

  // ========== Emoji picker ==========
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
    emojiPicker.style.visibility = 'hidden';
    emojiPicker.style.top = '0'; emojiPicker.style.left = '0';
    const pw = emojiPicker.offsetWidth, ph = emojiPicker.offsetHeight;
    let left = window.scrollX + r.left;
    let top = window.scrollY + r.bottom + 6;
    const vpRight = window.scrollX + window.innerWidth - 8;
    if (left + pw > vpRight) left = Math.max(8, (window.scrollX + r.right) - pw);
    const vpBottom = window.scrollY + window.innerHeight - 8;
    if (top + ph > vpBottom) top = window.scrollY + r.top - ph - 6;
    emojiPicker.style.top = top + 'px'; emojiPicker.style.left = left + 'px';
    emojiPicker.style.visibility = '';
    emojiPicker.querySelectorAll('button').forEach(b => {
      b.onclick = async (e) => {
        e.stopPropagation();
        const emoji = b.dataset.emoji;
        closeEmojiPicker();
        await fetch('/api/reactions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, comment_id: targetId, emoji })
        });
        await refreshComments();
      };
    });
  }

  // ========== Card positioning + active state ==========
  function pickArticleElement() {
    const candidates = document.querySelectorAll('main, article, .wrap, .content, .container');
    let best = null, bestW = 0;
    for (const el of candidates) {
      if (el.closest('.tdoc-bar, .tdoc-popup, .tdoc-margin-comment, #tdoc-comment-layer, .tdoc-footer')) continue;
      const r = el.getBoundingClientRect();
      if (r.width > bestW && r.width > 200) { best = el; bestW = r.width; }
    }
    return best || document.body;
  }
  function getContentRightEdge() {
    const candidates = document.querySelectorAll('main, article, .wrap, .content, .container');
    let bestRight = 0, bestW = 0;
    for (const el of candidates) {
      if (el.closest('.tdoc-bar, .tdoc-popup, .tdoc-margin-comment, .tdoc-footer')) continue;
      const r = el.getBoundingClientRect();
      if (r.width > bestW && r.width > 200 && r.width < window.innerWidth) {
        bestW = r.width; bestRight = r.right;
      }
    }
    if (bestRight > 0) return bestRight + window.scrollX;
    for (const el of document.querySelectorAll('p, h1, h2, h3')) {
      const r = el.getBoundingClientRect();
      if (r.width > bestW && r.width > 300 && r.width < window.innerWidth) {
        bestW = r.width; bestRight = r.right;
      }
    }
    return bestRight > 0 ? bestRight + window.scrollX : window.innerWidth - 320;
  }

  function repositionCards() {
    if (state.narrow) {
      for (const card of state.cardEls.values()) { card.style.top = ''; card.style.left = ''; }
      return;
    }
    const margin = 12, cardGap = 16, cardWidth = 280;
    let cardLeft = getContentRightEdge() + cardGap;
    const maxLeft = window.scrollX + window.innerWidth - cardWidth - 12;
    if (cardLeft > maxLeft) cardLeft = maxLeft;

    const anchored = state.activeComments
      .map(c => ({ c, mark: state.anchorMarks.get(c.id), card: state.cardEls.get(c.id) }))
      .filter(x => x.mark && x.card && (x.mark.ranges?.[0] || x.mark.el))
      .map(x => {
        let top;
        if (x.mark.ranges?.[0]) top = x.mark.ranges[0].getBoundingClientRect().top;
        else top = x.mark.el.getBoundingClientRect().top;
        return { ...x, top: top + window.scrollY };
      })
      .sort((a, b) => a.top - b.top);

    // Plain document-order stacking. Each card aligns to its anchor's top;
    // if two would overlap, the later one drops below the previous by margin.
    // No special handling for the active card — its position is stable.
    let prevBottom = 0;
    for (const row of anchored) {
      let y = row.top;
      if (y < prevBottom + margin) y = prevBottom + margin;
      row.card.style.top = y + 'px';
      row.card.style.left = cardLeft + 'px';
      row.card.classList.remove('tdoc-unanchored');
      prevBottom = y + row.card.offsetHeight;
    }

    const unanchored = state.activeComments
      .map(c => ({ c, card: state.cardEls.get(c.id) }))
      .filter(x => x.card && !state.anchorMarks.get(x.c.id));
    for (const { card } of unanchored) {
      const y = Math.max(prevBottom + 32, 100);
      card.style.top = y + 'px';
      card.style.left = cardLeft + 'px';
      card.classList.add('tdoc-unanchored');
      prevBottom = y + card.offsetHeight;
    }
    // Reposition element outlines
    document.querySelectorAll('.tdoc-element-outline:not(.pending)').forEach(o => o._reposition?.());
  }

  function setActiveComment(id) {
    state.activeId = id || null;
    document.querySelectorAll('.tdoc-anchor-mark.active, .tdoc-margin-comment.active, .tdoc-element-outline.active')
      .forEach(el => el.classList.remove('active'));
    if (!id) { rebuildSharedHighlights(); return; }
    const mark = state.anchorMarks.get(id);
    if (mark?.el?.classList) mark.el.classList.add('active');
    const card = state.cardEls.get(id);
    card?.classList.add('active');
    rebuildSharedHighlights();
    // Do NOT reposition cards on click — only the .active highlight should
    // change. Reordering cards every click is disorienting; users expect
    // stable positions and just the visual cue swap. Cards keep whatever
    // layout repositionCards() established at refresh/resize time.
    scrollAnchorIntoView(id);
  }

  function scrollAnchorIntoView(id) {
    const mark = state.anchorMarks.get(id);
    if (!mark) return;
    let anchorRect = null;
    // Prefer the underlying TARGET ELEMENT (canvas/img/video etc) over the
    // overlay outline div — same rect, but more semantically correct.
    if (mark.ranges?.[0]) anchorRect = mark.ranges[0].getBoundingClientRect();
    else if (mark.targetEl?.getBoundingClientRect) anchorRect = mark.targetEl.getBoundingClientRect();
    else if (mark.el?.getBoundingClientRect) anchorRect = mark.el.getBoundingClientRect();
    if (!anchorRect) return;

    // We consider the anchor "comfortably visible" if its top is between the
    // bar (44px) and 60% of the viewport. Otherwise smooth-scroll so it lands
    // in the upper third — readable, with room for the card next to it.
    const barH = 44;
    const top = anchorRect.top;
    const vpH = window.innerHeight;
    const comfortableMin = barH + 80;
    const comfortableMax = vpH * 0.6;
    if (top >= comfortableMin && top <= comfortableMax) return;
    const targetTop = vpH * 0.25;          // land at 25% of viewport
    const delta = top - targetTop;
    window.scrollBy({ top: delta, behavior: 'smooth' });
  }

  // ========== Element outlines (saved + pending) ==========
  function outlineElement(comment) {
    const el = findElement(comment.anchor);
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
    outline._reposition = repos;
    outline._targetEl = el;
    outline.style.pointerEvents = 'none';
    return { el: outline, targetEl: el };
  }

  // ========== refreshComments ==========
  async function refreshComments() {
    // Clear all anchor state
    clearAllCommentHighlights();
    unwrapFallbackSpans();
    document.querySelectorAll('.tdoc-element-outline:not(.pending)').forEach(el => el.remove());
    for (const card of commentLayer.querySelectorAll('.tdoc-margin-comment')) card.remove();
    state.anchorMarks.clear();
    state.cardEls.clear();

    let list = [];
    if (isFork) {
      // Read-only: parse the embedded JSON. No /api calls.
      const block = document.getElementById('tdoc-fork-comments');
      if (block) {
        try { list = (JSON.parse(block.textContent || '{}').comments) || []; } catch { list = []; }
      }
    } else {
      try {
        const r = await fetch(`/api/comments?slug=${encodeURIComponent(slug)}`);
        list = await r.json();
      } catch { list = []; }
    }
    state.activeComments = list.filter(c => c.status !== 'resolved');
    document.body.classList.toggle('tdoc-has-comments', state.activeComments.length > 0);
    document.body.dataset.tdocReady = '1';

    const fabCount = document.getElementById('tdoc-fab-count');
    if (fabCount) fabCount.textContent = state.activeComments.length;

    for (const comment of state.activeComments) {
      const kind = comment.anchor?.kind || (comment.anchor?.text ? 'text' : null);
      if (kind === 'text') {
        const range = findTextRange(comment.anchor);
        if (range) {
          if (HIGHLIGHT_API) {
            state.anchorMarks.set(comment.id, { kind: 'text', ranges: [range] });
          } else {
            const span = fallbackWrapAsSpan(comment, range);
            if (span) {
              span.addEventListener('click', (e) => { e.stopPropagation(); setActiveComment(comment.id); });
              span.style.cursor = 'pointer';
              state.anchorMarks.set(comment.id, { kind: 'text', el: span });
            }
          }
        }
      } else if (kind === 'element') {
        const out = outlineElement(comment);
        if (out) {
          out.targetEl.addEventListener('click', (e) => { e.stopPropagation(); setActiveComment(comment.id); });
          if (out.targetEl.style) out.targetEl.style.cursor = 'pointer';
          state.anchorMarks.set(comment.id, { kind: 'element', el: out.el, targetEl: out.targetEl });
        }
      }
      const card = buildCard(comment);
      commentLayer.appendChild(card);
      state.cardEls.set(comment.id, card);
    }
    rebuildSharedHighlights();
    evaluateLayout();
    requestAnimationFrame(repositionCards);
  }

  // Click on a Highlight-API range → activate. Highlight API has no per-range
  // event so we delegate from a root click handler by hit-testing ranges.
  function findCommentAtPoint(x, y) {
    if (!HIGHLIGHT_API) return null;
    for (const [id, mark] of state.anchorMarks) {
      if (!mark.ranges) continue;
      for (const r of mark.ranges) {
        const rects = r.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          const rect = rects[i];
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return id;
        }
      }
    }
    return null;
  }

  // ========== Narrow mode (single source of truth) ==========
  function evaluateLayout() {
    const MIN_ARTICLE_WIDTH = 400;
    const MIN_COLUMN_WIDTH = 300;
    const isPhone = window.innerWidth < 700;
    const article = pickArticleElement();
    let articleWidth = Infinity, articleRight = 0;
    if (article && article !== document.body) {
      const r = article.getBoundingClientRect();
      articleWidth = r.width;
      articleRight = r.right;
    }
    const columnRoom = window.innerWidth - articleRight;
    const narrow = isPhone || articleWidth < MIN_ARTICLE_WIDTH || columnRoom < MIN_COLUMN_WIDTH;
    state.narrow = narrow;
    document.body.classList.toggle('tdoc-narrow', narrow);
    fab.style.display = (narrow && state.activeComments.length > 0) ? 'inline-flex' : 'none';
    if (!narrow) commentLayer.classList.remove('open');
  }

  window.addEventListener('resize', () => requestAnimationFrame(() => { evaluateLayout(); repositionCards(); }));
  window.addEventListener('scroll', () => requestAnimationFrame(repositionCards), { passive: true });
  if (window.ResizeObserver) new ResizeObserver(() => repositionCards()).observe(document.body);

  // ========== Auth (Device Flow) ==========
  let pollTimer = null;
  async function startDeviceFlow() {
    if (!isPublished) return;
    const r = await fetch('/api/auth/device/start', { method: 'POST' });
    const data = await r.json();
    if (data.error) { alert('Sign-in error: ' + (data.message || data.error)); return; }
    showDeviceModal(data);
    window.open(data.verification_uri, '_blank');
    pollTimer = setInterval(() => pollDevice(data.device_code), (data.interval || 5) * 1000);
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
        <div class="actions"><button id="tdoc-modal-cancel">Cancel</button></div>
      </div>`;
    document.body.appendChild(bg);
    document.getElementById('tdoc-user-code').onclick = () => navigator.clipboard?.writeText(data.user_code);
    document.getElementById('tdoc-modal-cancel').onclick = closeDeviceModal;
  }
  function closeDeviceModal() {
    const m = document.getElementById('tdoc-device-modal');
    if (m) m.remove();
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ========== Publish / Share modals ==========
  function closeAuxModal() {
    const m = document.getElementById('tdoc-aux-modal');
    if (m) m.remove();
  }
  function showPublishModal() {
    closeAuxModal();
    const bg = document.createElement('div');
    bg.className = 'tdoc-modal-bg';
    bg.id = 'tdoc-aux-modal';
    bg.innerHTML = `
      <div class="tdoc-modal" data-state="idle">
        <h3>Publish this doc</h3>
        <p>We'll deploy this to your Cloudflare Worker so anyone with the link can read it. GitHub sign-in is required for commenting.</p>
        <div class="step"><span class="n">·</span><span>Slug: <code id="tdoc-pub-slug">${escapeHtml(slug)}</code></span></div>
        <div class="status" id="tdoc-pub-status" style="margin-top:10px;display:none;"></div>
        <div id="tdoc-pub-result" style="margin-top:10px;display:none;">
          <div class="code" style="font-size:14px;letter-spacing:0;text-align:left;" id="tdoc-pub-url"></div>
          <div class="actions" style="justify-content:flex-start;gap:8px;">
            <button class="primary" id="tdoc-pub-copy">Copy link</button>
            <button id="tdoc-pub-open">View live →</button>
          </div>
        </div>
        <div class="actions">
          <button id="tdoc-pub-cancel">Cancel</button>
          <button class="primary" id="tdoc-pub-go">Publish</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    document.getElementById('tdoc-pub-cancel').onclick = closeAuxModal;
    document.getElementById('tdoc-pub-go').onclick = async () => {
      const status = document.getElementById('tdoc-pub-status');
      const go = document.getElementById('tdoc-pub-go');
      status.style.display = 'block';
      status.textContent = 'Publishing — this can take 20–60s on first run…';
      go.disabled = true;
      try {
        const r = await fetch('/api/publish', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug })
        });
        const data = await r.json();
        if (!r.ok || data.error) {
          status.textContent = 'Failed: ' + (data.error || data.message || 'unknown');
          go.disabled = false;
          return;
        }
        const url = data.url;
        status.style.display = 'none';
        const result = document.getElementById('tdoc-pub-result');
        result.style.display = 'block';
        document.getElementById('tdoc-pub-url').textContent = url;
        document.getElementById('tdoc-pub-copy').onclick = () => navigator.clipboard?.writeText(url);
        document.getElementById('tdoc-pub-open').onclick = () => window.open(url, '_blank');
        document.getElementById('tdoc-pub-go').style.display = 'none';
        document.getElementById('tdoc-pub-cancel').textContent = 'Done';
      } catch (e) {
        status.textContent = 'Failed: ' + e.message;
        go.disabled = false;
      }
    };
  }
  function showShareModal() {
    closeAuxModal();
    const url = `${location.origin}/d/${encodeURIComponent(slug)}/v/${version}`;
    const bg = document.createElement('div');
    bg.className = 'tdoc-modal-bg';
    bg.id = 'tdoc-aux-modal';
    bg.innerHTML = `
      <div class="tdoc-modal">
        <h3>Share this doc</h3>
        <div class="code" id="tdoc-share-url" style="font-size:14px;letter-spacing:0;text-align:left;cursor:copy;">${escapeHtml(url)}</div>
        <div class="actions" style="justify-content:flex-start;gap:8px;margin-top:0;margin-bottom:10px;">
          <button class="primary" id="tdoc-share-copy">Copy link</button>
          <button id="tdoc-share-open">Open in new tab</button>
        </div>
        <p style="font-size:13px;color:#666;">Anyone with this link can read. To comment, they sign in with GitHub.</p>
        <div style="border-top:1px solid #eee;padding-top:12px;margin-top:12px;">
          <p style="margin:0 0 6px;color:#c33;font-size:13px;"><b>Unpublish</b></p>
          <p style="margin:0 0 6px;font-size:12px;color:#666;">Unpublish requires the upload token, which only lives on your laptop. Run this locally:</p>
          <div class="code" style="font-size:13px;letter-spacing:0;text-align:left;cursor:copy;" id="tdoc-share-unpub">/tdoc unpublish ${escapeHtml(slug)}</div>
        </div>
        <div class="actions"><button id="tdoc-share-close">Close</button></div>
      </div>`;
    document.body.appendChild(bg);
    document.getElementById('tdoc-share-close').onclick = closeAuxModal;
    document.getElementById('tdoc-share-copy').onclick = () => navigator.clipboard?.writeText(url);
    document.getElementById('tdoc-share-open').onclick = () => window.open(url, '_blank');
    document.getElementById('tdoc-share-url').onclick = () => navigator.clipboard?.writeText(url);
    document.getElementById('tdoc-share-unpub').onclick = (e) => {
      navigator.clipboard?.writeText(e.currentTarget.textContent);
    };
  }
  async function pollDevice(device_code) {
    try {
      const r = await fetch('/api/auth/device/poll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      if (data.error === 'authorization_pending' || data.error === 'slow_down') return;
      if (data.error === 'expired_token' || data.error === 'access_denied') {
        if (status) status.textContent = 'Code expired or denied. Try again.';
        if (pollTimer) clearInterval(pollTimer);
      }
    } catch { /* keep polling */ }
  }

  // ========== Popup (new-comment): text + element anchors ==========
  let popup = null;
  let pendingElementOutline = null;

  function setPendingTextHighlight(range) {
    if (!HIGHLIGHT_API || !range) return;
    pendingHighlight.clear();
    pendingHighlight.add(range);
  }
  function clearPendingTextHighlight() {
    if (HIGHLIGHT_API) pendingHighlight.clear();
  }
  function setPendingElementOutline(el) {
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
  function closePopup() {
    if (popup) { popup.remove(); popup = null; }
    clearPendingTextHighlight();
    clearPendingElementOutline();
  }

  function openPopup(anchor, rect) {
    if (isFork) return; // read-only fork view: no new comments
    closePopup();
    hideHoverOutline();
    popup = document.createElement('div');
    popup.className = 'tdoc-popup';
    const needsSignIn = isPublished && !identity;
    const preview = anchor.kind === 'text'
      ? `"${escapeHtml(anchor.text.slice(0, 80))}${anchor.text.length > 80 ? '…' : ''}"`
      : `📎 ${escapeHtml(anchor.label)}`;
    popup.innerHTML = `
      <div class="head"><span class="h">${preview}</span><span class="x">×</span></div>
      ${needsSignIn ? '<div class="signin-needed">Sign in with GitHub to comment.</div>' : ''}
      <textarea placeholder="What should change?" ${needsSignIn ? 'disabled' : ''}></textarea>
      <div class="foot">
        <span class="hint">${needsSignIn ? '' : '⌘+Enter to submit'}</span>
        <button class="submit">${needsSignIn ? 'Sign in' : 'Comment'}</button>
      </div>`;
    // Default: open below `rect` (used for text-selection popups so it follows
    // the cursor). For element anchors invoked via the Comment pill, we want
    // the popup to open ABOVE the pill so it doesn't dive into the artifact
    // body. The caller signals this by setting anchor._placeAbove = true.
    document.body.appendChild(popup);   // append first so offsetHeight is known
    const popupH = popup.offsetHeight || 140;
    if (anchor._placeAbove && rect.top - 8 - popupH >= 8) {
      popup.style.top = (window.scrollY + rect.top - popupH - 8) + 'px';
    } else {
      popup.style.top = (window.scrollY + rect.bottom + 8) + 'px';
    }
    const left = Math.min(rect.left + window.scrollX, window.innerWidth - 340);
    popup.style.left = Math.max(8, left) + 'px';

    if (anchor.kind === 'text' && anchor._range) {
      setPendingTextHighlight(anchor._range);
      window.getSelection()?.removeAllRanges();
    } else if (anchor.kind === 'element' && anchor._el) {
      setPendingElementOutline(anchor._el);
    }

    const textarea = popup.querySelector('textarea');
    if (!needsSignIn) textarea.focus();
    popup.querySelector('.x').onclick = closePopup;

    const submit = async () => {
      if (needsSignIn) { closePopup(); startDeviceFlow(); return; }
      const text = textarea.value.trim();
      if (!text) return;
      const sendAnchor = anchor.kind === 'text'
        ? { kind: 'text', text: anchor.text, context_before: anchor.context_before, context_after: anchor.context_after }
        : { kind: 'element', selector: anchor.selector, label: anchor.label };
      const r = await fetch('/api/comments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, version, anchor: sendAnchor, text })
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
      const fullText = range.startContainer.textContent || '';
      const start = range.startOffset, end = range.endOffset;
      return {
        before: fullText.slice(Math.max(0, start - chars), start),
        after: fullText.slice(end, end + chars)
      };
    } catch { return { before: '', after: '' }; }
  }

  // ========== Drag-to-comment on artifacts ==========
  const COMMENTABLE = 'img, svg, canvas, video, pre, figure, iframe[src]';
  const DRAG_THRESHOLD = 5;
  let dragState = null;

  function isInUI(el) {
    return el && el.closest && el.closest('.tdoc-bar, .tdoc-popup, .tdoc-margin-comment, .tdoc-modal-bg, .tdoc-anchor-mark, .tdoc-element-outline, .tdoc-hover-outline, .tdoc-comment-pill, .tdoc-emoji-picker, .tdoc-secondary-menu, #tdoc-comment-layer, .tdoc-footer');
  }
  function rectsOverlap(a, b) { return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom); }
  function findArtifactIntersecting(dragRect) {
    const sx = window.scrollX, sy = window.scrollY;
    for (const el of document.querySelectorAll(COMMENTABLE)) {
      if (isInUI(el)) continue;
      const r = el.getBoundingClientRect();
      const pageRect = { left: r.left + sx, top: r.top + sy, right: r.right + sx, bottom: r.bottom + sy };
      if (rectsOverlap(pageRect, dragRect)) return el;
    }
    return null;
  }
  function elementSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) { parts.unshift(`#${CSS.escape(cur.id)}`); break; }
      const parent = cur.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(' > ');
  }
  function elementLabel(el) {
    return el.getAttribute('alt') || el.getAttribute('aria-label') || el.getAttribute('title') || el.tagName.toLowerCase();
  }

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const t = e.target;
    if (!t || t.nodeType !== 1 || isInUI(t)) return;
    if (t.closest('button, a, input, select, textarea, [contenteditable], [role="button"]')) return;
    if (t.matches(COMMENTABLE) || t.closest(COMMENTABLE)) return;
    dragState = { x0: e.pageX, y0: e.pageY, marquee: null, dragged: false };
  }, true);

  document.addEventListener('mousemove', (e) => {
    if (!dragState) return;
    const dx = e.pageX - dragState.x0, dy = e.pageY - dragState.y0;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    dragState.dragged = true;
    const dragRect = {
      left: Math.min(dragState.x0, e.pageX), top: Math.min(dragState.y0, e.pageY),
      right: Math.max(dragState.x0, e.pageX), bottom: Math.max(dragState.y0, e.pageY),
    };
    const hit = findArtifactIntersecting(dragRect);
    if (hit) {
      if (!dragState.marquee) {
        dragState.marquee = document.createElement('div');
        dragState.marquee.className = 'tdoc-drag-marquee';
        document.body.appendChild(dragState.marquee);
      }
      dragState.marquee.style.left = Math.min(dragState.x0, e.pageX) + 'px';
      dragState.marquee.style.top = Math.min(dragState.y0, e.pageY) + 'px';
      dragState.marquee.style.width = Math.abs(dx) + 'px';
      dragState.marquee.style.height = Math.abs(dy) + 'px';
    } else if (dragState.marquee) {
      dragState.marquee.remove(); dragState.marquee = null;
    }
  }, true);

  document.addEventListener('mouseup', (e) => {
    if (!dragState) return;
    const { x0, y0, dragged, marquee } = dragState;
    dragState = null;
    if (marquee) marquee.remove();
    if (!dragged) return;
    const dragRect = {
      left: Math.min(x0, e.pageX), top: Math.min(y0, e.pageY),
      right: Math.max(x0, e.pageX), bottom: Math.max(y0, e.pageY),
    };
    const el = findArtifactIntersecting(dragRect);
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    hideHoverOutline();
    openPopup({ kind: 'element', selector: elementSelector(el), label: elementLabel(el), _el: el }, el.getBoundingClientRect());
  }, true);

  // ========== Hover affordance ==========
  // ========== Artifact hover affordance ==========
  // Hovering an unanchored commentable element (img/canvas/svg/video/pre)
  // shows: (1) a dashed blue outline around it, (2) a clickable "Comment" pill
  // in its top-right corner. Click the pill → opens the comment popup anchored
  // to that element. This is the discoverable path; drag-from-outside also
  // works for users who prefer that gesture.
  let hoverOutlineEl = null, commentPill = null, pillTargetEl = null;
  function showHoverUI(el) {
    if (isFork) return; // read-only: no new-comment affordances
    if (hoverOutlineEl?._target === el && pillTargetEl === el) return;
    hideHoverUI();
    const r = el.getBoundingClientRect();

    hoverOutlineEl = document.createElement('div');
    hoverOutlineEl.className = 'tdoc-hover-outline';
    hoverOutlineEl._target = el;
    hoverOutlineEl.style.top = (window.scrollY + r.top - 3) + 'px';
    hoverOutlineEl.style.left = (window.scrollX + r.left - 3) + 'px';
    hoverOutlineEl.style.width = (r.width + 6) + 'px';
    hoverOutlineEl.style.height = (r.height + 6) + 'px';
    document.body.appendChild(hoverOutlineEl);

    commentPill = document.createElement('button');
    commentPill.className = 'tdoc-comment-pill';
    commentPill.type = 'button';
    commentPill.setAttribute('aria-label', 'Comment on this');
    commentPill.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Comment`;
    // Position the pill INSIDE the artifact's top-right corner. Always anchored
    // to the artifact body so it visually belongs to it. (Kept inside on user
    // request after trying the outside-only variant.)
    const pillW = 110;
    commentPill.style.top = (window.scrollY + r.top + 8) + 'px';
    commentPill.style.left = (window.scrollX + Math.max(r.left + 8, r.right - pillW - 8)) + 'px';
    commentPill.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const target = pillTargetEl;
      // Capture the pill's own rect BEFORE we hide it — that's where the
      // popup should attach (just above the pill the user clicked).
      const pillRect = commentPill.getBoundingClientRect();
      hideHoverUI();
      if (!target) return;
      openPopup({
        kind: 'element',
        selector: elementSelector(target),
        label: elementLabel(target),
        _el: target,
        _placeAbove: true,
      }, pillRect);
    };
    pillTargetEl = el;
    document.body.appendChild(commentPill);
  }
  function hideHoverUI() {
    if (hoverOutlineEl) { hoverOutlineEl.remove(); hoverOutlineEl = null; }
    if (commentPill) { commentPill.remove(); commentPill = null; }
    pillTargetEl = null;
  }

  document.addEventListener('mouseover', (e) => {
    const t = e.target;
    if (!t || t.nodeType !== 1) return;
    // The pill itself is in `body` — don't hide UI when the cursor enters it.
    if (t.closest('.tdoc-comment-pill') || t.closest('.tdoc-hover-outline')) return;
    if (isInUI(t)) { hideHoverUI(); return; }
    const el = t.matches(COMMENTABLE) ? t : t.closest(COMMENTABLE);
    if (!el || isInUI(el)) { hideHoverUI(); return; }
    // Show the pill on EVERY commentable artifact, including those already
    // anchored by an existing comment. Multiple comments on one artifact is
    // a normal pattern (e.g. several reviewers commenting on the same image).
    // The pill is in the top-right corner; clicking the artifact body still
    // activates any existing comment as a separate gesture.
    showHoverUI(el);
  });
  document.addEventListener('mouseout', (e) => {
    const next = e.relatedTarget;
    if (!next) { hideHoverUI(); return; }
    // Stay shown if cursor moves into the pill or outline.
    if (next.closest && (next.closest('.tdoc-comment-pill') || next.closest('.tdoc-hover-outline'))) return;
    // Stay shown if cursor moves to the same artifact (mouseover children).
    if (pillTargetEl && next.closest && next.closest(COMMENTABLE) === pillTargetEl) return;
    if (isInUI(next)) hideHoverUI();
  });
  // Hide retained alias used elsewhere
  function hideHoverOutline() { hideHoverUI(); }
  function hideHoverHint() { /* no-op kept for legacy callers */ }

  // ========== Selection → popup ==========
  document.addEventListener('mouseup', (e) => {
    if (isInUI(e.target)) return;
    if (e.target.nodeType === 1) {
      const commentable = e.target.matches?.(COMMENTABLE) ? e.target : e.target.closest?.(COMMENTABLE);
      if (commentable && !isInUI(commentable)) return;
    }
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel.toString().trim();
      if (text && text.length >= 2) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const ctx = getContext(range, 60);
        openPopup({ kind: 'text', text, context_before: ctx.before, context_after: ctx.after, _range: range }, rect);
      }
    }, 0);
  });

  // ========== Root click handler (delegated): menus, drawer, deselect, anchor click ==========
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || t.nodeType !== 1) return;

    // Close menus that aren't under the cursor
    if (!t.closest('#tdoc-more-btn') && !t.closest('#tdoc-secondary-menu')) secMenu.classList.remove('open');
    if (!t.closest('.tdoc-menu-wrap')) copyMenu.classList.remove('open');
    if (!t.closest('.tdoc-emoji-picker') && !t.closest('.tdoc-react-add')) closeEmojiPicker();

    // Close drawer on outside click (narrow only)
    if (commentLayer.classList.contains('open') &&
        !t.closest('#tdoc-comment-layer, .tdoc-fab, .tdoc-popup, .tdoc-modal-bg, .tdoc-emoji-picker')) {
      commentLayer.classList.remove('open');
    }

    // Custom-Highlight API: hit-test anchor ranges to detect anchor click.
    if (HIGHLIGHT_API && !isInUI(t)) {
      const hitId = findCommentAtPoint(e.clientX, e.clientY);
      if (hitId) { setActiveComment(hitId); return; }
    }

    // Deselect when clicking truly-outside the UI + outside any anchor/artifact.
    if (isInUI(t)) return;
    for (const mark of state.anchorMarks.values()) {
      const target = mark.targetEl || mark.el;
      if (target && (target === t || (target.contains && target.contains(t)))) return;
    }
    setActiveComment(null);
    const sel = window.getSelection();
    if (sel && sel.toString().trim() === '' && sel.rangeCount > 0) sel.removeAllRanges();
  });

  // ========== Copy as Markdown ==========
  function htmlToMarkdown(root) {
    function walk(node, ctx) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.nodeValue;
        if (ctx.inPre) return t;
        return t.replace(/\s+/g, ' ');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
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
        case 'strong': case 'b': return '**' + kids() + '**';
        case 'em': case 'i': return '*' + kids() + '*';
        case 'code': return ctx.inPre ? kids() : '`' + kids() + '`';
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
        case 'svg': case 'canvas': case 'video': case 'iframe':
          return `\n\n[${tag} embed]\n\n`;
        case 'figure': return '\n\n' + kids().trim() + '\n\n';
        case 'figcaption': return '\n\n*' + kids().trim() + '*\n\n';
        case 'table': {
          const rows = Array.from(node.querySelectorAll('tr'));
          if (!rows.length) return '';
          const cells = (r) => Array.from(r.children).map(c => walk(c, ctx).trim().replace(/\|/g, '\\|'));
          const head = cells(rows[0]);
          const body = rows.slice(1).map(cells);
          return '\n\n| ' + head.join(' | ') + ' |\n| ' + head.map(() => '---').join(' | ') + ' |\n' +
                 body.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n\n';
        }
        case 'th': case 'td': case 'tr': return kids();
        default: return kids();
      }
    }
    return walk(root, { inPre: false }).replace(/\n{3,}/g, '\n\n').trim();
  }

  async function copyText(s) {
    try { await navigator.clipboard.writeText(s); return true; }
    catch {
      const ta = document.createElement('textarea');
      ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }
  function flashCopied(btn) {
    if (!btn || btn.dataset.flashing === '1') return;
    btn.dataset.flashing = '1';
    const orig = btn.innerHTML;
    const oc = btn.style.color, ob = btn.style.borderColor;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Copied</span>`;
    btn.style.color = '#3ecf8e'; btn.style.borderColor = '#3ecf8e';
    setTimeout(() => {
      btn.innerHTML = orig; btn.style.color = oc; btn.style.borderColor = ob;
      btn.dataset.flashing = '0';
    }, 1200);
  }
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

  window.__tdocCopyDocMd = async function (includeComments) {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('.tdoc-bar, .tdoc-popup, .tdoc-margin-comment, .tdoc-modal-bg, .tdoc-element-outline, .tdoc-hover-outline, #tdoc-comment-layer, .tdoc-footer, script, style, noscript').forEach(n => n.remove());
    let md = htmlToMarkdown(clone);
    if (includeComments && state.activeComments.length) {
      md += '\n\n---\n\n## Comments\n\n' + state.activeComments.map(commentToMd).join('\n---\n\n');
    }
    const ok = await copyText(md);
    if (ok) flashCopied(document.getElementById('tdoc-copy-md-btn'));
    else flashToast('Copy failed');
  };
  window.__tdocCopyCommentMd = async function (commentId, srcBtn) {
    const c = state.activeComments.find(x => x.id === commentId);
    if (!c) return;
    const ok = await copyText(commentToMd(c));
    if (ok && srcBtn) {
      const origHTML = srcBtn.innerHTML, origColor = srcBtn.style.color;
      srcBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      srcBtn.style.color = '#3ecf8e';
      setTimeout(() => { srcBtn.innerHTML = origHTML; srcBtn.style.color = origColor; }, 1200);
    } else if (!ok) flashToast('Copy failed');
  };

  // ========== Wire it up ==========
  refreshComments();
})();
