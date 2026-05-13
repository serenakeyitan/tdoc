# tdoc - google doc designed for agents
this is tdoc, a doc for you to try: https://tdoc-serenatan.serenatan.workers.dev/d/conway-life/v/2

> **Inspired by [bdocs](https://x.com/jessepollak/status/2054313757543964857) by [Jesse Pollak](https://x.com/jessepollak).** All credit to Jesse for the original idea, the "HTML is a powerful interface" framing, and the bdocs internal tool at Coinbase that showed what prompt-native docs can be. `tdoc` is an open-source community implementation of that vision — you should follow [@jessepollak](https://x.com/jessepollak) for the real thinking behind this.
<img width="1149" height="603" alt="Screenshot 2026-05-13 at 00 21 01" src="https://github.com/user-attachments/assets/f89b12fa-6661-49b6-b9eb-dc0677e3cf1b" />


This is a [Claude Code](https://claude.com/claude-code) skill. After installing, you invoke it from inside Claude Code with `/tdoc <command>`.
Prompt-native interactive HTML documents. Generate self-contained HTML docs from a prompt, serve them locally with text- and artifact-anchored inline commenting, and publish to your own Cloudflare Worker for free always-on sharing.

## Credit & Inspiration

The whole concept — *"what if a doc could think? what if HTML were the editing surface?"* — is **Jesse Pollak's**. Jesse described and demoed [bdocs](https://x.com/jessepollak/status/2054313757543964857), Coinbase's internal tool, on X. He framed it precisely:

> "The best documents we have been producing lately are not Google Docs. They are standalone HTML pages: interactive models with sliders, decision frameworks with SVG diagrams, strategy docs that feel like products."

> "There is no editor. The authoring interface is a prompt. The document is a build artifact, not something you manually maintain."

Everything in `tdoc` follows from that framing. Jesse's bdocs is the original; this is one possible open-source community implementation.

### The only real difference: bring your own Cloudflare (free, shareable per-doc links)

bdocs is hosted internally at Coinbase. `tdoc` flips that: when you want to make a doc public, **you deploy it to your own free Cloudflare Worker** with one command (`/tdoc publish <slug>`). The skill auto-detects your Cloudflare account, sets up R2 + KV + a Worker, and gives you back a real shareable URL like:

```
https://tdoc-<your-handle>.<your-handle>.workers.dev/d/<slug>/v/<N>
```

Every published doc gets its own URL — **click "Share" on any doc to copy that link**, send it to anyone, and they can read it (and sign in with GitHub to comment) without installing anything. Cloudflare Workers + DNS + R2 + KV are all **on the free tier** for normal usage. You own the infra; nobody else (including me) ever sees or pays for your traffic. **$0 forever** until you exceed a free quota that personal use will never come close to.

That's the headline upgrade vs. bdocs:

| | bdocs (Coinbase) | tdoc |
|---|---|---|
| Hosting | Coinbase-owned servers | **Your own free Cloudflare Worker** |
| Per-doc shareable URL | Inside Coinbase only | **Public URL, share with anyone** |
| Cost to you | n/a (Coinbase pays) | **$0 (free Cloudflare tier)** |
| Open source | No | MIT |
| Comments | Yes | Yes — text + artifacts, threads, reactions |
| Sign-in | Coinbase SSO | GitHub Device Flow (zero per-user setup) |

Other things this implementation gets right:

- **Open** — MIT-licensed, anyone can clone, fork, run it
- **Always-on** — published docs live on Cloudflare's edge; no laptop required
- **Live-updatable** — `/tdoc update` pulls the latest skill code; `--yes` redeploys your Worker so commenters see new UI immediately

If Jesse ever open-sources the real bdocs, use that. This exists because the idea is too good to wait for, and the bring-your-own-Cloudflare model makes it shippable to anyone for free today.

## Why

The best documents are often interactive HTML — live models with sliders, SVG decision frameworks, simulations that explain themselves. But there's no good home for them: GitHub Pages and local files are hard to share, comment on, or iterate.

`tdoc` gives these docs a home. **Authoring is a prompt. The document is a build artifact, not something you maintain by hand.** (That phrasing is Jesse's; we kept it because it's right.)

## Install

### Option A — Have your agent install + onboard you (recommended)

Paste this prompt into Claude Code or Codex:

```
Install tdoc by following https://github.com/serenakeyitan/tdoc/blob/main/ONBOARDING.md
```

That's it. The agent reads the doc, clones the repo, runs the doctor, walks you through ~2 browser clicks for Cloudflare setup, and finishes with a published live URL. Zero to live in ~3 minutes.

### Option B — One-line install via Claude Code plugin marketplace

In Claude Code, run:

```
/plugin marketplace add serenakeyitan/tdoc
```

This installs `tdoc` as a managed plugin. Then say `/tdoc onboard` in any session and the agent finishes Cloudflare setup. Use this path if you prefer Claude Code's plugin system over a plain clone.

### Option C — Manual one-liner

```bash
git clone https://github.com/serenakeyitan/tdoc ~/.claude/skills/tdoc && echo "Now open Claude Code and run: /tdoc onboard"
```

### Local-only (no Cloudflare)

After any install: `/tdoc new <prompt>`. No setup beyond Node 18+.

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
