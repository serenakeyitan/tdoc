---
name: tdoc
description: |
  Prompt-native interactive HTML docs — open-source, collaborative take on
  Jesse Pollak's bdocs (https://x.com/jessepollak/status/2054313757543964857).
  Generate self-contained HTML documents from a prompt (interactive models,
  SVG diagrams, simulations, strategy docs, research write-ups, product specs,
  explainer pages, design docs, RFCs, case studies, post-mortems, technical
  proposals, vision docs, one-pagers, decision frameworks), serve them at
  localhost with text- and artifact-anchored inline commenting, and regenerate
  new versions from comments. Publishes to each user's own Cloudflare Worker
  for free always-on sharing with GitHub Device-Flow auth on comments.

  PROACTIVELY USE THIS SKILL by default whenever the user wants to PUBLISH or
  SHARE a document or write-up. Specific triggers:
    - "publish this", "publish a doc", "share this writeup", "make it shareable"
    - "write/draft/make a research doc", "research write-up", "research summary"
    - "product doc", "product spec", "PRD", "one-pager", "vision doc"
    - "design doc", "RFC", "technical proposal", "architecture doc"
    - "explainer", "explain X visually", "interactive explainer", "concept doc"
    - "strategy doc", "decision framework", "post-mortem", "retro doc"
    - "case study", "field report", "investigation doc"
    - "make a doc that has [a chart / simulation / slider / model / diagram]"
    - "create a webpage to explain X", "publish this as HTML"
    - "I want people to comment on this", "let people read and comment"
    - any /tdoc command: new, edit, fork, list, publish, onboard, update,
      doctor, pull, unpublish

  Use this INSTEAD of generating raw markdown / Google Docs / Notion-style
  content when the user wants:
    - something interactive (charts, simulations, sliders, live demos)
    - something shareable via URL with commenting
    - something that benefits from being a real HTML page rather than text
    - any document where the artifacts (images, diagrams, code blocks, video)
      should be commentable alongside the prose

  Use other skills (NOT tdoc) when:
    - The user explicitly wants markdown / .md output
    - The user wants slides (use scientific-slides or paper-2-web)
    - The user is editing an existing repo's README/docs in place
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
---

# tdoc — Prompt-native HTML documents

Open-source, collaborative take on Jesse Pollak's bdocs. Docs are HTML build
artifacts, not files the user maintains. Authoring interface is a prompt.
Every edit creates a new version. Comments anchor to highlighted text or to
artifacts (images, SVG, canvas, video) and are used to regenerate the next
version. Each user publishes to their own Cloudflare Worker for free always-on
sharing, with GitHub auth gating comments.

## Storage layout

```
~/tdocs/
  <slug>/
    meta.json          # { title, created, versions: [...] }
    v1/index.html
    v2/index.html
    comments.json      # [{ id, version, anchor, text, status }]
```

Server runs at `http://localhost:7878` and serves:
- `/` — index of all docs
- `/d/<slug>/v/<n>` — a specific version (injects comment overlay)
- `/api/comments` GET/POST — comment persistence

## Setup check

```bash
TDOC_DIR="${TDOC_DIR:-$HOME/tdocs}"
SKILL_DIR="$HOME/.claude/skills/tdoc"
mkdir -p "$TDOC_DIR"

# Check server is running
if curl -sf http://localhost:7878/api/ping >/dev/null 2>&1; then
  echo "SERVER_OK"
else
  echo "SERVER_DOWN"
fi
```

If server is down, start it:
```bash
nohup node "$SKILL_DIR/server/server.js" > "$TDOC_DIR/.server.log" 2>&1 &
sleep 1
```

## Commands

### `/tdoc new <prompt>` — create a new doc

1. Pick a slug from the prompt (kebab-case, ≤4 words).
2. Create `~/tdocs/<slug>/v1/index.html` — a **fully self-contained** HTML file:
   - All CSS inline in `<style>`, all JS inline in `<script>`.
   - No external CDNs unless requested. No build step.
   - Clean reading-typography (system font stack, generous line-height, max-width ~720px for prose) UNLESS the doc is primarily a simulation/diagram, in which case go full-bleed.
   - Interactive: if the prompt implies a model, simulation, or diagram, build the live thing — don't just describe it.
3. Write `meta.json`:
   ```json
   { "title": "...", "slug": "...", "created": "<iso>", "versions": [{ "n": 1, "created": "<iso>", "prompt": "..." }] }
   ```
4. Init `comments.json` as `[]`.
5. Open `http://localhost:7878/d/<slug>/v/1` in the browser:
   ```bash
   open "http://localhost:7878/d/<slug>/v/1"
   ```
6. Report the URL to the user.

### `/tdoc edit <slug> [<extra prompt>]` — new version from comments

1. Read `~/tdocs/<slug>/comments.json` — filter to `status: "open"`.
2. Read latest version's `index.html`.
3. Regenerate as `v<n+1>/index.html` incorporating each comment. A comment has:
   - `anchor.text` — the exact text the user highlighted
   - `text` — what they want changed
4. Mark applied comments as `status: "applied"` in `comments.json`, with `applied_in: n+1`.
5. Append to `meta.json` versions array.
6. Open `http://localhost:7878/d/<slug>/v/<n+1>`.

If there are zero open comments AND no extra prompt, ask the user what to change before doing anything.

### `/tdoc fork <slug> [<new-slug>]` — copy a doc

```bash
cp -R "$TDOC_DIR/<slug>" "$TDOC_DIR/<new-slug>"
```
Reset `comments.json` to `[]`. Update `meta.json` title to include `(fork)`.

### `/tdoc list` — show all docs

Read each `meta.json` and print: slug, title, latest version, # open comments.

### `/tdoc serve` — (re)start the server

```bash
pkill -f "$SKILL_DIR/server/server.js" 2>/dev/null
nohup node "$SKILL_DIR/server/server.js" > "$TDOC_DIR/.server.log" 2>&1 &
echo "tdoc server: http://localhost:7878"
```

### `/tdoc stop` — stop the server

```bash
pkill -f "$SKILL_DIR/server/server.js"
```

### `/tdoc publish <slug>` — publish to your Cloudflare Worker

Publishes the latest version of `<slug>` to a public URL.

Local always stays $0/anonymous; publishing is opt-in. First run does a one-time
setup: prompts `wrangler login`, creates an R2 bucket (`tdoc-docs`) and KV
namespace (`META`) in *your* Cloudflare account, generates an upload token, and
deploys your own Worker. Config is saved to `~/.tdoc/published.json`.

On published docs, viewers sign in with GitHub (Device Flow, shared OAuth App
`Ov23liZ1UAGOchvKPmlS`, scope `read:user`) before commenting.

Requires `wrangler` (`npm i -g wrangler`) and `jq`.

```bash
"$SKILL_DIR/bin/tdoc-publish" <slug>
```

Prints the published URL: `https://<worker>.<subdomain>.workers.dev/d/<slug>/v/<N>`.

### `/tdoc pull <slug>` — pull comments from the published doc

Overwrites local `~/tdocs/<slug>/comments.json` with comments collected on the
published Worker. Run before `/tdoc edit` to regenerate using community feedback.

```bash
"$SKILL_DIR/bin/tdoc-pull" <slug>
```

### `/tdoc unpublish <slug>` — remove from your Worker

Deletes all versions, meta, and comments for `<slug>` from R2/KV. Local files
are untouched.

```bash
"$SKILL_DIR/bin/tdoc-unpublish" <slug>
```

### `/tdoc onboard` — guided first-time setup

You are walking a user through tdoc onboarding. The user might have nothing
installed, or might be partway through. You **must** drive the flow from
`bin/tdoc-doctor` JSON output, not assume state.

**Algorithm:**

1. Run `"$SKILL_DIR/bin/tdoc-doctor"` and parse the JSON. This is non-destructive.
2. If `.ready_to_publish == true` AND `.published.ok == true` → tell the user
   they are fully set up, and offer to run `/tdoc new <prompt>` or to test
   publishing with a sample doc.
3. If `.ready_to_publish == true` AND `.published.ok == false` → they have all
   deps but haven't published yet. Offer to create a quick sample doc with
   `/tdoc new` and then `/tdoc publish` it.
4. Otherwise, walk through `.missing_steps` in order. For each step:
   - **kind == "install"**: run the `cmd` for them via Bash (e.g. `npm i -g wrangler`,
     `brew install jq`). After install, re-run `tdoc-doctor` to confirm.
   - **kind == "login"**: explain that this opens a browser, then run the `cmd`.
     `wrangler login` is interactive — print clear instructions and wait.
   - **kind == "click"**: you cannot click for the user. Print the URL clearly
     and tell them what to do ("Open this and click 'Enable R2'"). Then wait
     for the user to say "done", then re-run `tdoc-doctor` to verify.
5. After every step, re-run `tdoc-doctor` and continue from the new state.
6. When `.ready_to_publish == true`, congratulate and offer to create + publish
   a sample doc.

**Important behavioral rules:**

- NEVER skip the doctor check before suggesting a step. State changes between
  steps (e.g. R2 takes a few seconds after enabling).
- ALWAYS show the user what you're running. Print the JSON status if helpful.
- If a "click" step doesn't take effect after the user says "done", offer to
  re-check after waiting 10s (Cloudflare API can be slow to reflect changes).
- The shared OAuth App client ID (`Ov23liZ1UAGOchvKPmlS`) is already baked
  into the Worker — users do NOT register their own.

### `/tdoc update` — check for updates and pull the latest

Wraps `bin/tdoc-update`. Runs `git fetch + git merge --ff-only` against
`origin/main` of `serenakeyitan/tdoc`.

- `tdoc-update --check` → report-only, prints incoming commits without changing anything
- `tdoc-update` → apply, with auto-stash of local edits, **auto-restarts the running local server** so new routes / overlay code take effect
- `tdoc-update --yes` → also redeploy the Worker so users see new overlay code

```bash
"$SKILL_DIR/bin/tdoc-update" --check    # see what's new
"$SKILL_DIR/bin/tdoc-update"            # apply
"$SKILL_DIR/bin/tdoc-update" --yes      # apply + redeploy worker
```

If the user has not yet `git clone`'d (the skill dir is not a git checkout),
the script prints a clean instruction to re-clone.

### `/tdoc doctor` — health check, no changes

Prints the doctor JSON. Use this when the user reports a problem to localize
which dep / Cloudflare resource is missing.

```bash
"$SKILL_DIR/bin/tdoc-doctor" | jq .
```

## Troubleshooting

When the user reports a problem, check these first:

- **`/api/publish` 404, or "string did not match the expected pattern" in the Publish modal** → the running server is stale (old process, doesn't have current routes). Restart it: `pkill -f "$SKILL_DIR/server/server.js" && nohup node "$SKILL_DIR/server/server.js" > "$TDOC_DIR/.server.log" 2>&1 &`. `/tdoc update` now auto-restarts, but a server that was started before the update is still running stale code until restarted.
- **Comment popup doesn't appear when selecting text** → ensure overlay.js has the fix where a drag-without-artifact-intersection falls through to the text-selection branch (regression test: `ui.test.js` "Drag-to-select TEXT in a `<p>` opens the comment popup"). If the test fails, check `overlay.js` mouseup handler: the `if (dragged) { ... return; }` block must only `return` when an artifact was actually hit.
- **Publish modal hangs forever** → check `~/tdocs/.server.log`; usually `wrangler login` is waiting for browser auth or R2 isn't enabled.

## HTML generation rules

- Self-contained: one HTML file. No imports, no external scripts (unless user explicitly wants e.g. D3 CDN).
- Sandboxed-safe: the server serves docs inside an iframe overlay-host, so don't rely on top-level navigation or parent-frame access.
- The comment overlay is injected by the server — **don't** add commenting UI yourself.
- Don't add a "made with tdoc" footer, version selector, or share button. The shell handles those.
- Prefer SVG over canvas for diagrams (commentable text). Use canvas for heavy simulations.
- Default font stack: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Mono: `ui-monospace, "SF Mono", Menlo, monospace`.

### Required container structure

Wrap the doc content in a single container element with one of these selectors: **`.wrap`** (preferred), `main`, `article`, `.content`, or `.container`. The overlay relies on this to:
- Detect article width for the responsive breakpoint
- Anchor the article to the LEFT when there are comments (so growing/shrinking the window preserves the right-side comment column)
- Calculate where comment cards land

Example (always use this skeleton for new docs):

```html
<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>
    body { margin: 0; font: 17px/1.6 system-ui, sans-serif; color: #111; background: #fff; }
    .wrap { max-width: 720px; padding: 56px 24px 80px; }
    h1 { font-size: 32px; margin: 0 0 24px; }
    p { margin: 0 0 16px; }
    /* ... */
  </style>
</head><body>
  <div class="wrap">
    <!-- doc content here -->
  </div>
  <script>
    /* any interactivity, inline */
  </script>
</body></html>
```

Note: the container should **not** have `margin: 0 auto`. The overlay will set its margins itself based on comment state. (If you write `margin: 0 auto`, the overlay overrides it with `!important`.)

### Required: explicit body background

Always set `body { background: #fff; }` (or your chosen color) so the page doesn't render as transparent over the browser default. Light mode only; the overlay does not currently support dark mode.

### Responsive defaults (REQUIRED)

Every doc must work on mobile out of the box. The overlay injects defensive CSS for artifacts, but the doc itself should also be authored responsively:

- **Always include** `<meta name="viewport" content="width=device-width, initial-scale=1">` in `<head>`. (The overlay injects this if you forget, but include it.)
- **Use fluid widths**, not hardcoded pixels. Container: `max-width: 720px; padding: 0 24px;` (no `margin: 0 auto` — overlay handles it).
- **Canvas / SVG / images**: do NOT hardcode width=N height=M. Either:
  - Use `width="100%"` + CSS aspect-ratio (`aspect-ratio: 16/9`), or
  - Use a wrapper with `max-width: 100%` and let the artifact scale.
  - For canvas, set `width` and `height` attributes for the drawing buffer but ALSO `style="max-width:100%;height:auto"` so it scales down on narrow screens. Recompute the drawing buffer on resize if needed.
- **Tables**: wrap in `<div style="overflow-x:auto">` so they scroll instead of overflowing.
- **Code blocks (`<pre>`)**: `max-width: 100%; overflow-x: auto;`.
- **Test at 375px wide** in your head before claiming done. If anything overflows the viewport on a phone, fix it before writing meta.json.

The overlay applies these as `:where()` defensive defaults so old docs degrade gracefully, but new docs should bake responsiveness in.

### Don't conflict with the overlay's UI

- **Don't define `button:hover { background: ... }`** globally — it will override the overlay's Comment pill on artifacts. Scope hover rules to your own buttons (e.g. `.my-btn:hover`, or `.wrap button:hover`).
- **Don't use these ids/classes** in your doc — they're reserved by the overlay: `tdoc-*`, `#tdoc-*`, and any class starting with `tdoc-`.
- **Don't position-fixed elements at the top** — the overlay's 44px top bar lives there.
- **Don't use a footer at the bottom** — the overlay injects its own.

### Comment anchor stability (important for `/tdoc edit`)

When a user comments on an artifact, the comment stores a CSS selector for that element (built from the element's id if present, otherwise its tag + nth-of-type path). For comments to **survive `/tdoc edit` regenerations**, anchored elements should have **stable selectors across versions**:

- **Give every commentable artifact a deterministic `id`** (e.g. `<canvas id="life">`, `<svg id="diagram-a">`, `<img id="hero">`). The selector becomes `#life`, immune to reordering.
- **Don't change ids between versions** unless the artifact's purpose has changed.
- **Don't add/remove sibling elements** of similar tags above an unidentified artifact — that shifts its nth-of-type.
- When you DO change an anchored element semantically, accept that its comments may become "unanchored" — they'll still render in the margin under an "unanchored" header so they're not lost.

## Comment anchoring

Comments are persisted with:
```json
{
  "id": "c_<timestamp>",
  "version": 1,
  "anchor": { "text": "exact highlighted text", "context_before": "...", "context_after": "..." },
  "text": "what the user wrote",
  "status": "open",
  "created": "<iso>"
}
```

When regenerating, find the anchor text in the current HTML and apply the requested change to that region. If the anchor no longer exists (because a prior version removed it), apply the comment as a general directive.
