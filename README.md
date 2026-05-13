# tdoc

Prompt-native interactive HTML documents — a local clone of [bdocs](https://bdocs.cbhq.net). Generate self-contained HTML docs from a prompt, serve them locally with text- and artifact-anchored inline commenting, and publish to your own Cloudflare Worker for free always-on sharing.

This is a [Claude Code](https://claude.com/claude-code) skill. After installing, you invoke it from inside Claude Code with `/tdoc <command>`.

## Why

The best documents are often interactive HTML — live models with sliders, SVG decision frameworks, simulations that explain themselves. But there's no home for them: GitHub Pages and local files are hard to share, comment on, or iterate. `tdoc` gives these docs a home.

Authoring is a prompt. The document is a build artifact, not something you maintain by hand.

## Install

```bash
git clone https://github.com/serenakeyitan/tdoc ~/.claude/skills/tdoc
```

Then in Claude Code: `/tdoc new <your prompt>`.

## Commands

### Local (free, anonymous, zero-config)

- `/tdoc new <prompt>` — generate `~/tdocs/<slug>/v1/index.html` and open it
- `/tdoc edit <slug> [<extra prompt>]` — regenerate the next version from `comments.json` plus any extra prompt
- `/tdoc fork <slug> [<new-slug>]` — copy a doc to a new slug
- `/tdoc list` — show all local docs
- `/tdoc serve` / `/tdoc stop` — local server at `localhost:7878`

The local server is anonymous and free. Comments are stored in `~/tdocs/<slug>/comments.json`.

### Publish (free, multi-user, ~3 min setup)

```
/tdoc publish <slug>
```

First run:
1. Verifies `wrangler` is installed and logged in
2. Auto-detects your Cloudflare account + workers.dev subdomain
3. Creates an R2 bucket (`tdoc-docs`) and a KV namespace (`META`) in your account
4. Generates an upload token and deploys your Worker
5. Uploads the doc

Subsequent runs upload to the existing Worker.

- `/tdoc pull <slug>` — sync comments from the published Worker back to local
- `/tdoc unpublish <slug>` — remove a published doc from R2/KV

### Requirements

- Node 18+
- `wrangler` (for publishing) — `npm i -g wrangler`
- `jq` (for publishing)
- A free [Cloudflare](https://dash.cloudflare.com) account with R2 enabled (one-time click)

## How comments work

- **Text**: highlight any text → popup → comment
- **Artifacts** (img / svg / canvas / video / `<pre>`): drag from outside the artifact onto it (mimics text selection). Clicking on an artifact passes through to the demo, preserving interactivity.
- **Threads**: each comment can have replies + emoji reactions (👍 ❤️ 🔥 🎉 😂 🤔 👀 🚀 ✅ ❌ ❓ ❗ + `LGTM`)
- **Sign-in**: published commenting requires GitHub Device Flow (shared OAuth App, scope `read:user`)

## Architecture

```
~/.claude/skills/tdoc/
  SKILL.md          — Claude Code skill manifest
  server/
    server.js       — local HTTP server (Node, no deps)
    overlay.js      — injected into every served doc; comment UI + auth flow
  worker/
    worker.js       — Cloudflare Worker (Workers runtime; no Node)
    wrangler.toml.template
  bin/
    tdoc-publish    — first-time setup + upload doc
    tdoc-pull       — pull comments from KV → local
    tdoc-unpublish  — delete from R2/KV
  test/
    ui.test.js      — Playwright UI tests against the deployed Worker
    api.test.js     — local HTTP API tests
```

Per-user runtime data lives at `~/tdocs/` (docs) and `~/.tdoc/` (publish config). Both are excluded from the repo.

## License

MIT
