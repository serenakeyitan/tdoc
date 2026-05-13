# Onboarding tdoc

> **For agents (Claude Code, Codex, etc.):** read this file end-to-end before running any command. It's written for you, not the human. Execute every step in order, ask the user for confirmation on browser-side actions, and re-probe state with `bin/tdoc-doctor` after each step.

## What you are installing

`tdoc` is a Claude Code skill that gives the user prompt-native HTML documents with text- and artifact-anchored comments. After install + onboarding, the user can:

- `/tdoc new <prompt>` → generate an interactive HTML doc
- `/tdoc publish <slug>` → publish to their own Cloudflare Worker (free, always-on)
- Share the live URL; commenters sign in with GitHub

Install + onboarding takes ~3 minutes on a clean machine. Most steps are automatic. The user only has to click ~2 things in a browser.

## Step 1 — Install the skill

Pick the install path that matches what the user already has set up:

### Path A: plain `git clone` (recommended, simplest)

```bash
# Get the latest from main (always the current release)
git clone https://github.com/serenakeyitan/tdoc ~/.claude/skills/tdoc
```

If the user already has `~/.claude/skills/tdoc/` from a prior install, update instead:

```bash
cd ~/.claude/skills/tdoc && git pull --ff-only origin main
```

### Path B: Claude Code plugin marketplace

If the user said "via marketplace" / "plugin install" / "use Path B" in their prompt, run these in Claude Code:

```
/plugin marketplace add serenakeyitan/tdoc
/plugin install tdoc@serenakeyitan-tdoc
```

Functionally equivalent to Path A — Claude Code tracks updates as a managed plugin instead of a plain clone. Default to Path A unless the user explicitly asked for the marketplace path.

(Future: once Anthropic accepts `tdoc` into the official marketplace, the canonical install will be `/plugin install tdoc@claude-plugins-official`. Until then, the line above is the canonical install.)

## Step 2 — Verify install

```bash
ls ~/.claude/skills/tdoc/SKILL.md
ls ~/.claude/skills/tdoc/bin/tdoc-doctor
```

Both files must exist. If either is missing, the clone failed — re-run Step 1.

## Step 3 — Run the doctor

`tdoc-doctor` is a non-destructive health probe. Run it and parse the JSON:

```bash
~/.claude/skills/tdoc/bin/tdoc-doctor
```

The JSON has these fields you care about:

```jsonc
{
  "deps": {
    "node":     { "ok": true/false, "version": "v22.x" },
    "wrangler": { "ok": true/false, "version": "4.x" },
    "jq":       { "ok": true/false },
    "gh":       { "ok": true/false }
  },
  "cloudflare": {
    "logged_in":   true/false,
    "account_id":  "<32-hex>",
    "subdomain":   { "ok": true/false, "name": "<subdomain>" },
    "r2_enabled":  true/false
  },
  "published": { "ok": true/false, "subdomain": "...", "worker": "..." },
  "ready_to_publish": true/false,
  "missing_steps": [
    { "id": "...", "label": "...", "kind": "install|login|click", "cmd": "..." }
  ]
}
```

## Step 4 — Walk the user through `missing_steps`

If `ready_to_publish` is `true` and `published.ok` is `true`, skip to Step 5 — they're already set up.

Otherwise, iterate over `missing_steps` **in order**. Each step has a `kind`:

| `kind`     | What you do                                                                                                |
|------------|------------------------------------------------------------------------------------------------------------|
| `install`  | Run the `cmd` yourself in a Bash tool call. Example: `npm i -g wrangler`. Re-run doctor after.            |
| `login`    | The `cmd` is interactive (`wrangler login`). Run it; it opens the user's browser. Wait for it to finish.  |
| `click`    | The `cmd` is a URL. **You cannot click for the user.** Print the URL and what to do, then ask them to say "done" when they've clicked. After they say done, re-run doctor — Cloudflare can take 5–10s to propagate. |

Always re-run `bin/tdoc-doctor` between steps. State changes — what was missing in iteration N may be resolved in N+1.

**The two `click` steps you'll encounter most:**

1. **Claim a workers.dev subdomain** — one-time pick. URL: `https://dash.cloudflare.com/<account_id>/workers/onboarding`. User chooses any name (typically their handle). Free.
2. **Enable R2** — one-time click. URL: `https://dash.cloudflare.com/<account_id>/r2`. Free tier is 10 GB. Requires acknowledging Cloudflare's pricing page.

Don't surprise the user — explain briefly *why* before you ask them to click.

## Step 5 — Offer a sample doc

When `ready_to_publish` is `true`, offer to publish a sample. A reasonable default:

```bash
# Pick a slug
SLUG="welcome"
# Generate a simple HTML doc (you can be more creative)
mkdir -p ~/tdocs/$SLUG/v1
cat > ~/tdocs/$SLUG/v1/index.html <<'HTML'
<!doctype html><meta charset="utf-8"><title>Hello tdoc</title>
<style>body{font:18px/1.6 system-ui;max-width:680px;margin:80px auto;padding:0 20px}h1{color:#1652f0}</style>
<h1>Hello, tdoc.</h1>
<p>This is your first document. Highlight any text to leave a comment.</p>
HTML
cat > ~/tdocs/$SLUG/meta.json <<EOF
{"title":"Hello tdoc","slug":"$SLUG","versions":[{"n":1,"created":"$(date -Iseconds)"}]}
EOF
echo '[]' > ~/tdocs/$SLUG/comments.json
# Publish
~/.claude/skills/tdoc/bin/tdoc-publish $SLUG
```

The script prints the live URL. Show it to the user.

## Step 6 — Wrap up

Tell the user:

- They can now run `/tdoc new <prompt>` for any new doc
- Run `/tdoc update` to pull the latest skill code anytime
- Run `/tdoc doctor` if anything feels off
- Visit `https://github.com/serenakeyitan/tdoc` for the source, issues, contributions

## Idempotency

Every step is safe to re-run. The doctor reads state; the publish script checks for existing resources before creating. The user can interrupt and resume at any point.

## What to skip if the user just wants local

If the user says they only want local docs (no publishing, no Cloudflare), stop after Step 2. The local skill works with zero setup beyond Node 18+.

```bash
# Test that local works
node --version  # should be v18 or higher
/tdoc new "a doc that explains compound interest with a slider"
```

## Failure modes you might hit

| Symptom                                          | Fix                                                            |
|--------------------------------------------------|----------------------------------------------------------------|
| `R2 not enabled` even after the user clicked      | Wait 10s, re-run doctor. Cloudflare's API is briefly stale.    |
| `wrangler` works in terminal but doctor says no   | Path issue. Tell user to restart their terminal.               |
| Worker deploys but `/api/upload` returns 401      | The new TDOC_UPLOAD_TOKEN secret hasn't propagated. Wait 15s, retry. |
| `gh` is missing                                   | Optional — `tdoc` doesn't need it. Skip.                       |

## Credit

`tdoc` is an open-source community implementation of Jesse Pollak's bdocs idea ([source](https://x.com/jessepollak/status/2054313757543964857)). All credit for the original concept and framing goes to Jesse.
