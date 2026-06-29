# Changelog

All notable changes to tdoc are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow the `VERSION`
file and `.claude-plugin/plugin.json`.

## [0.7.11] - 2026-06-29

Dual-engine code audit (Codex + Claude subagents, every finding adversarially
verified). Both engines independently flagged the same top cluster.

### Fixed — data loss

- **Reactions silently disappeared on a normal toggle.** A reaction's event id
  included the add-vs-remove kind, so `add → remove → add` folded to a stale
  "removed" — the reaction vanished even though the user's last action was to
  add it. The id also omitted the version, so the same reaction on different
  document versions clobbered each other (snapshots are supposed to be
  immutable). Both are fixed by one version-scoped id shared by add and remove;
  reactions stored before this release are migrated automatically.

### Fixed — security

- **Comment anchor could hijack rendering** (verified in a real browser). A
  stored anchor id was interpolated into a CSS selector, so a crafted id from a
  signed-in commenter could anchor a comment onto `<body>` or throw an error
  that aborted comment rendering for every viewer. Anchors now match by
  attribute equality — no selector string is ever built from stored data.
- **CLI slug path traversal.** `tdoc publish` / `pull` / `unpublish` used the
  slug in filesystem paths and API URLs without validation; a `..` slug escaped
  the tdoc directory. They now enforce the same kebab-case rule as `tdoc new`.
- **Hardening:** upload/comment/reaction endpoints validate the slug (and
  version) before it becomes a storage key; reactions reject reserved object
  keys as emoji; the upload-token check is constant-time; the sign-in modal
  escapes its values and only opens https github.com URLs; `published.json`
  (which holds the upload token) is created `0600` from the start.

### Fixed — robustness

- Comment refresh no longer breaks when the API returns an error body instead
  of a list; reaction clicks now re-auth on an expired session and surface
  failures instead of silently dropping; the sign-in flow handles network/edge
  errors; text highlights re-anchor correctly on browsers without the CSS
  Custom Highlight API. `tdoc update --check` reports the real commit count.

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
