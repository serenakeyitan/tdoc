# tdoc — google doc, but designed for agents

See it live: https://tdoc.serenatan.workers.dev

https://github.com/user-attachments/assets/872957b6-34bd-4c67-a3fa-3911ebd09d09

<img width="1149" height="603" alt="Screenshot 2026-05-13 at 00 21 01" src="https://github.com/user-attachments/assets/f89b12fa-6661-49b6-b9eb-dc0677e3cf1b" />

> check out my recent work at https://github.com/agent-team-foundation/first-tree 🥇

**Turn a prompt into an interactive doc, share it as a live URL, get Google-Docs-style comments back — straight into your agent.**

Open-source take on Jesse Pollak's bdocs concept. Authored by an agent, not maintained by hand. tdoc deploys to **your own free Cloudflare Worker**, so you get a public shareable link with zero hosting cost and zero infra to manage — and it's a Claude Code / Codex **skill** with built-in version control.

```
You:  /tdoc new "an explainer with a slider showing how interest compounds"
Claude: <generates doc, opens it locally>
You:  /tdoc publish
Claude: https://tdoc.yourname.workers.dev/d/compound-interest/v/1
```

Anyone with the link reads it instantly and comments on any sentence, image, or chart. Your agent pulls those comments, regenerates the next version, and replies on each comment with ✅ applied / 🟡 partial / ❓ question — so you can see exactly what got addressed without leaving the doc.

## The painpoint

**You no longer need to be the router between your colleagues' comments and your agent.**

Feedback on docs from a chat was always a tradeoff:

- A nice UI for people to comment (Google Doc, Slack thread, screenshots) → but you copy-paste it all back to the AI by hand, every round.
- Or clean structured input the agent can act on (raw JSON, "edit line 47") → but nobody wants to write feedback that way.

And docs made in chat have no version history — every regeneration overwrites the last.

`tdoc` gives you both sides: humans comment Google-Docs-style on any sentence/image/chart, the agent reads the same comments as structured input, and every edit is a new version you can flip back to. All free, all yours.

## Install

Paste this into Claude Code or Codex:

```
Install tdoc by following https://github.com/serenakeyitan/tdoc/blob/main/ONBOARDING.md
```

The agent clones the repo, runs the doctor, walks you through the ~2 browser clicks for Cloudflare, and ends with a published URL. **Zero to live in ~3 minutes.**

Or via the plugin marketplace: `/plugin marketplace add serenakeyitan/tdoc`

## Commands

| Command | What it does |
|---|---|
| `/tdoc new <prompt>` | Generate a new doc + open locally |
| `/tdoc edit <slug>` | New version from open comments; replies on each with ✅/🟡/❓ status |
| `/tdoc publish <slug>` | Deploy to your Cloudflare Worker, get a public URL |
| `/tdoc pull <slug>` | Sync comments from the published doc back to local |
| `/tdoc fork <slug>` | Copy a doc to a new slug |
| `/tdoc unpublish <slug>` | Remove a published doc from your Worker |
| `/tdoc list` | Show all docs |
| `/tdoc onboard` | First-time guided setup |
| `/tdoc update` | Pull the latest skill code |
| `/tdoc doctor` | Health check (deps, Cloudflare config) |

## Cost

**$0 for normal use.** Cloudflare Workers + R2 + KV all have generous free tiers that personal usage will never come close to. You own your account; nobody else (including the maintainer) sees your traffic or pays your bills.

## How comments work

- **Text**: highlight any sentence (across paragraphs, across bold/links — anchors survive regeneration) → comment popup, cursor ready to type
- **Artifacts** (img / canvas / svg / video / `<pre>`): hover → "Comment" pill → click
- **Threads**: emoji reactions (👍 ❤️ 🔥 ✅ ❓ + `LGTM`) and replies; hover a reaction to see who reacted
- **Move / remove anchor**: drag a comment to new text, or detach it entirely — it stays in the thread
- **Versions**: a `v3 ▾` picker in the top bar — every version is kept and browsable
- **Agent replies**: when your agent regenerates from comments, it replies on each with `tdoc-agent` and a status emoji (✅ applied / 🟡 partial / ❓ needs clarification)
- **Auth**: local docs comment anonymously with zero setup. Published docs require a one-time GitHub sign-in (Device Flow, scope `read:user`) before commenting.

## Requirements

- Node 18+
- `wrangler` (for publishing)
- `jq` (for publishing)
- A free Cloudflare account with R2 enabled

`/tdoc onboard` checks and installs these for you.

## Testing

```bash
node test/ui.test.js                # 29 UI / overlay cases (drag-to-select, popup, comments)
node test/responsive.test.js        # 15 Playwright viewport cases
node test/api.test.js               # 8 local-server API cases (requires running server)
node test/publish.test.js           #  6 publish-flow cases
node test/onboarding.test.js        # 13 doctor/onboarding cases (mocked)
TDOC_INTEGRATION=1 node test/onboarding.test.js   # + real Cloudflare round-trip
node test/dimensions-audit.js       # responsive screenshots across widths
```

## Telemetry

tdoc records when it runs, how it went (success / error / abandoned),
how long it took, and a random UUID for your machine, and sends those
events to the tdoc maintainer's Supabase. **It does NOT record your
tdoc content, your prompts, file paths, or anything else.** Nothing is
sent to Anthropic.

The maintainer uses this to figure out which features people use,
what breaks, and what to fix next — without guessing.

### What's collected (the full list)

| Field             | Example                            |
|-------------------|------------------------------------|
| `ts`              | `2026-05-20T16:32:11Z`             |
| `skill`           | `tdoc`                             |
| `outcome`         | `success` / `error` / `abandoned`  |
| `duration_s`      | `87`                               |
| `error_detail`    | one-line error tag, ≤160 chars     |
| `step`            | which step failed (if any)         |
| `session_id`      | Claude Code session ID             |
| `installation_id` | random UUID per machine            |

The full schema and edge-function code live in `telemetry/` — read the
code if you want to verify.

### Three opt-out paths

1. **On first run**: the consent prompt offers "Off" as one of three
   choices (the others are "On" and "Anonymous").
2. **Persistent**: `echo off > ~/.tdoc/.telemetry-mode`
3. **Ephemeral** (one shell): `export SKILL_TELEMETRY=off`

Anonymous mode sends events but sets `installation_id` to `null`, so
the maintainer can count usage without identifying individual machines.

### How to delete your data

Your installation_id is at `~/.tdoc/telemetry/installation-id`. Send it
to the maintainer and ask them to delete rows matching it (one SQL
line — no excuse not to).

## Credit

The concept and original framing are [Jesse Pollak](https://x.com/jessepollak)'s [bdocs](https://x.com/jessepollak/status/2054313757543964857) at Coinbase. `tdoc` is one possible open-source community implementation. If Jesse open-sources the real bdocs, use that.

## License

MIT
