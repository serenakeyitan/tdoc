# Changelog

All notable changes to tdoc are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow the `VERSION`
file and `.claude-plugin/plugin.json`.

## [0.7.10] - 2026-06-28

Four user-facing fixes that landed on `main` after 0.7.9 — most relevant to
**plugin-marketplace** installs, which are pinned to the manifest version and
were stuck on the buggy 0.7.9 until this bump.

### Fixed

- **Plugin manifest `repository` rejected at startup** (#42) — `plugin.json`
  used the npm `{type, url}` object form; Claude Code's schema requires a
  string URL, so it threw a validation error on every launch. Flattened to the
  string form.
- **`/plugin marketplace add` failed schema validation** (#36) — `marketplace.json`
  was missing the required top-level `owner` object. Added it; also dropped a
  stale per-plugin version pin that silently froze marketplace users on an old
  version.
- **`publish` aborted on modern macOS wrangler** (#37) — the CLI hardcoded the
  legacy `~/.wrangler` token path; wrangler 4.x stores it under
  `~/Library/Preferences/.wrangler` (xdg-app-paths). Now resolves the token in
  wrangler's own precedence (legacy-if-exists first, else xdg), honors
  `CLOUDFLARE_API_TOKEN` / `CF_API_TOKEN`, and `doctor` reports
  `publish_token_ok` so it no longer says "logged in" while the token read
  silently fails.
- **Dead Cloudflare onboarding link (404)** (#38) — the `…/workers/onboarding`
  URL Cloudflare retired now points to `?to=/:account/workers-and-pages` at all
  three places it was emitted (doctor, publish, ONBOARDING.md).

### Engineering / CI (no behavior change)

- Manifest schema test pins `plugin.json` + `marketplace.json` to the Claude
  Code schema, plus a version-drift guard requiring `VERSION`, `plugin.json`,
  and any marketplace version to agree — this is the class of bug (#36, #42)
  that shipped to users four times.
- CI supply-chain hardening: GitHub Actions pinned to commit SHAs,
  `permissions: contents: read`, and ShellCheck on the credential-handling CLIs.
- Added `SECURITY.md`, `CODEOWNERS`, issue/PR templates, a CodeQL workflow
  (JS), and Dependabot for GitHub Actions.

## [0.7.9] - 2026-06-26

### Fixed

- **Lingering selection highlight when commenting on text** — selecting one
  line and commenting left that line (and everything below, worst across table
  cells) visually highlighted until you clicked elsewhere. Root cause was the
  browser's native selection, not the comment anchor: `closePopup()` cleared
  the pending tdoc highlight but never called `getSelection().removeAllRanges()`.
  Now cleared on submit / cancel / Esc / click-away.

[0.7.10]: https://github.com/serenakeyitan/tdoc/releases/tag/v0.7.10
[0.7.9]: https://github.com/serenakeyitan/tdoc/releases/tag/v0.7.9
