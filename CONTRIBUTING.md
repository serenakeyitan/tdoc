# Contributing

## Repo layout

`tdoc` is dual-shaped to support both install styles:

```
~/.claude/skills/tdoc/
├── SKILL.md                    ← canonical skill manifest (for `git clone` install)
├── .claude-plugin/
│   ├── plugin.json             ← plugin manifest (for `/plugin install` install)
│   └── marketplace.json        ← single-plugin marketplace (so `/plugin marketplace add serenakeyitan/tdoc` works)
└── skills/tdoc/
    └── SKILL.md                ← MUST match root SKILL.md exactly (plugin-mode discovery)
```

**Important**: when you edit `SKILL.md` at the root, also copy it to `skills/tdoc/SKILL.md` (or vice versa). They must stay in sync. Run:

```bash
cp SKILL.md skills/tdoc/SKILL.md
```

before committing any change that touches `SKILL.md`. A pre-commit hook handles this automatically (see below).

## Two install paths

We support two install paths and don't want either to break:

1. **Plain git clone** — `git clone https://github.com/serenakeyitan/tdoc ~/.claude/skills/tdoc`. Claude Code finds `SKILL.md` at the root of `~/.claude/skills/tdoc/`. Simple, no plugin system needed.
2. **Claude Code plugin marketplace** — `/plugin marketplace add serenakeyitan/tdoc` + `/plugin install tdoc@serenakeyitan-tdoc`. Claude Code reads `.claude-plugin/plugin.json` and discovers skills inside `skills/<name>/SKILL.md`.

Don't break either.

## Credit

This project owes its concept to Jesse Pollak's bdocs at Coinbase. When you add to the docs or write release notes, keep the credit prominent. `tdoc` is a community implementation, not an original idea.

## Tests

```bash
# fast, no network
node test/onboarding.test.js
node test/api.test.js          # requires local server running

# slower, hits the published worker
node test/ui.test.js

# full integration (real Cloudflare round-trip)
TDOC_INTEGRATION=1 node test/onboarding.test.js
```

All tests should pass before any commit to `main`.
