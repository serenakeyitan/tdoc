# tdoc

**Turn a prompt into an interactive HTML doc, share it as a live URL, get comments back.**

Open-source take on Jesse Pollak's bdocs concept. Same idea: prose, sliders, charts, simulations — authored by an agent, not maintained by hand. The difference: tdoc deploys to **your own free Cloudflare Worker**, so you get a public shareable link with zero hosting cost and zero infra to manage.

```
You:  /tdoc new "an explainer with a slider showing how interest compounds"
Claude: <generates doc, opens it locally>
You:  /tdoc publish
Claude: https://tdoc-yourname.yourname.workers.dev/d/compound-interest/v/1
```

Anyone with the link reads it instantly. Signs in with GitHub to comment on any sentence, image, or chart. You pull the comments back (`/tdoc pull`), tell Claude what to do with them, and it regenerates v2.

## The painpoint

The best docs you write today aren't Google Docs — they're interactive HTML pages: models with sliders, decision frameworks with SVG diagrams, strategy docs that feel like products. But there's no good home for them. GitHub Pages is for code repos. Notion can't run a JS simulation. Local files won't share. You end up emailing zip files or screenshotting your work.

`tdoc` is the missing home: prompt → interactive HTML → public URL → comments → regenerate. All free, all yours.

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
| `/tdoc edit <slug>` | Regenerate the doc from any open comments |
| `/tdoc publish <slug>` | Deploy to your Cloudflare Worker, get a public URL |
| `/tdoc pull <slug>` | Sync comments from the published doc back to local |
| `/tdoc fork <slug>` | Copy a doc to a new slug |
| `/tdoc list` | Show all docs |
| `/tdoc onboard` | First-time guided setup |
| `/tdoc update` | Pull the latest skill code |
| `/tdoc doctor` | Health check (deps, Cloudflare config) |

## Cost

**$0 for normal use.** Cloudflare Workers + R2 + KV all have generous free tiers that personal usage will never come close to. You own your account; nobody else (including the maintainer) sees your traffic or pays your bills.

## How comments work

- **Text**: highlight any sentence → comment popup
- **Artifacts** (img / canvas / svg / video / `<pre>`): hover → "Comment" pill in the corner → click
- **Threads**: each comment has emoji reactions (👍 ❤️ 🔥 ✅ ❓ + `LGTM`) and replies
- **Auth**: published commenting requires GitHub sign-in (Device Flow, scope `read:user`)

## Requirements

- Node 18+
- `wrangler` (for publishing)
- `jq` (for publishing)
- A free Cloudflare account with R2 enabled

`/tdoc onboard` checks and installs these for you.

## Testing

```bash
node test/responsive.test.js        # 46 Playwright viewport tests
node test/ui.test.js                # 28 UI tests
node test/dimensions-audit.js       # 26-width responsive audit
node test/onboarding.test.js        # 9 mocked onboarding scenarios
TDOC_INTEGRATION=1 node test/onboarding.test.js   # +4 real Cloudflare round-trip
```

## Credit

The concept and original framing are [Jesse Pollak](https://x.com/jessepollak)'s [bdocs](https://x.com/jessepollak/status/2054313757543964857) at Coinbase. `tdoc` is one possible open-source community implementation. If Jesse open-sources the real bdocs, use that.

## License

MIT
