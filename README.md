# tdoc

Prompt-native interactive HTML documents. Generate self-contained HTML docs from a prompt, serve them locally with text- and artifact-anchored inline commenting, and publish to your own Cloudflare Worker for free always-on sharing.

This is a [Claude Code](https://claude.com/claude-code) skill. After installing, you invoke it from inside Claude Code with `/tdoc <command>`.

## Inspiration

Inspired by [**bdocs**](https://x.com/jessepollak/status/2054313757543964857) by [Jesse Pollak](https://x.com/jessepollak) — Coinbase's internal tool for prompt-native docs that demonstrated how HTML can be a "powerful interface" for AI-generated documents. `tdoc` is an **open-source, collaborative take** on that idea:

- **Open** — MIT-licensed, anyone can clone and run it
- **Collaborative** — each user publishes to *their own* Cloudflare Worker, gets a real shareable URL, and viewers sign in with GitHub to comment on text or artifacts (images, SVG, canvas, video). Threaded replies, emoji reactions.
- **Always-on** — published docs live on Cloudflare's edge (free tier). No laptop needed.
- **Live-updatable** — `/tdoc update` pulls the latest skill code; `--yes` redeploys your Worker so commenters get the new UI immediately.

## Why

The best documents are often interactive HTML — live models with sliders, SVG decision frameworks, simulations that explain themselves. But there's no good home for them: GitHub Pages and local files are hard to share, comment on, or iterate.

`tdoc` gives these docs a home. **Authoring is a prompt. The document is a build artifact, not something you maintain by hand.**

## Install

```bash
git clone https://github.com/serenakeyitan/tdoc ~/.claude/skills/tdoc
```

Then in Claude Code (or Codex) just say:

```
/tdoc onboard
```

The agent reads `bin/tdoc-doctor`, installs anything missing (Node 18+, wrangler, jq), guides you through Cloudflare setup (free), and offers to publish a sample doc. Smooth from zero to live URL in ~3 minutes.

For local-only use (no Cloudflare): just `/tdoc new <prompt>` works immediately, no setup.

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

### Setup & maintenance

- `/tdoc onboard` — guided setup. Agent runs the doctor, installs missing deps, walks you through any browser-side clicks (R2 enable, subdomain claim), then offers to publish a sample doc. Idempotent — safe to re-run.
- `/tdoc doctor` — non-destructive health check. Prints JSON describing every dep + every Cloudflare resource. Use when something feels off.
- `/tdoc update` — git fetch + fast-forward pull from `origin/main`. Stashes local edits, restores them after.
  - `tdoc-update --check` → preview incoming commits
  - `tdoc-update --yes` → also redeploy your Worker so users see the new overlay

### Requirements

- Node 18+
- `wrangler` (for publishing) — `npm i -g wrangler`
- `jq` (for publishing)
- A free [Cloudflare](https://dash.cloudflare.com) account with R2 enabled (one-time click)

`/tdoc onboard` checks and installs all of these for you.

## How comments work

- **Text**: highlight any text → popup → comment
- **Artifacts** (img / svg / canvas / video / `<pre>`): drag from outside the artifact onto it (mimics text selection). Clicking on an artifact passes through to the demo, preserving interactivity.
- **Threads**: each comment can have replies + emoji reactions (👍 ❤️ 🔥 🎉 😂 🤔 👀 🚀 ✅ ❌ ❓ ❗ + `LGTM`)
- **Sign-in**: published commenting requires GitHub Device Flow (shared OAuth App, scope `read:user`)

## Architecture

```
~/.claude/skills/tdoc/
  SKILL.md            — Claude Code skill manifest
  server/
    server.js         — local HTTP server (Node, no deps)
    overlay.js        — injected into every served doc; comment UI + auth flow
  worker/
    worker.js         — Cloudflare Worker (Workers runtime; no Node)
    wrangler.toml.template
  bin/
    tdoc-doctor       — non-destructive health probe (JSON output)
    tdoc-publish      — first-time setup + upload doc
    tdoc-pull         — pull comments from KV → local
    tdoc-unpublish    — delete from R2/KV
    tdoc-update       — git pull origin/main + optional redeploy
  test/
    ui.test.js        — Playwright UI tests against the deployed Worker
    api.test.js       — local HTTP API tests
    onboarding.test.js — mocked doctor scenarios + gated real round-trip
```

Per-user runtime data lives at `~/tdocs/` (docs) and `~/.tdoc/` (publish config). Both are excluded from the repo.

## Testing

```bash
# Unit / API tests against a running local server
node test/api.test.js

# UI tests against the deployed worker
node test/ui.test.js

# Onboarding scenarios (mocked — fast, deterministic)
node test/onboarding.test.js

# Onboarding + real Cloudflare round-trip (creates and deletes a throwaway doc on your account)
TDOC_INTEGRATION=1 node test/onboarding.test.js
```

Mock states for `tdoc-doctor` are controlled by env vars (`TDOC_MOCK_NO_WRANGLER`, `TDOC_MOCK_NO_R2`, etc.) — see `bin/tdoc-doctor` for the full list.

## License

MIT
