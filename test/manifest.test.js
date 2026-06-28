// Manifest schema tests.
//
// Guards the two JSON manifests Claude Code validates at load/install time
// against the field types its schema actually enforces. This whole class of
// bug has already shipped to users FOUR times — every one would have been
// caught here:
//   #36  marketplace.json missing required `owner` object
//   #42  plugin.json `repository` as npm {type,url} object, not a string URL
//   (plus two version-drift incidents where plugin.json fell behind VERSION)
//
// These run offline with zero dependencies (pure node + fs), like the rest of
// the suite — no network, no secrets, no schema-validator package. The rules
// below are transcribed from the official references:
//   plugin.json    -> https://code.claude.com/docs/en/plugins-reference  (Metadata fields)
//   marketplace.json-> https://code.claude.com/docs/en/plugin-marketplaces (Required fields)
//
// Run:
//   node test/manifest.test.js
//
// Exit code: 0 if all pass, 1 otherwise.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLUGIN = path.join(ROOT, '.claude-plugin/plugin.json');
const MARKET = path.join(ROOT, '.claude-plugin/marketplace.json');
const VERSION_FILE = path.join(ROOT, 'VERSION');

let pass = 0, fail = 0;
function ok(name) { console.log(`  ✓ ${name}`); pass++; }
function bad(name, err) { console.log(`  ✗ ${name}\n    ${err}`); fail++; }
function t(name, fn) { try { fn(); ok(name); } catch (e) { bad(name, e.message); } }

function readJson(p) {
  const raw = fs.readFileSync(p, 'utf8');
  try { return JSON.parse(raw); }
  catch (e) { throw new Error(`${path.basename(p)} is not valid JSON: ${e.message}`); }
}
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

console.log('--- plugin.json (Claude Code plugin manifest schema) ---');

const plugin = (() => { try { return readJson(PLUGIN); } catch (e) { bad('plugin.json parses', e.message); return null; } })();

if (plugin) {
  t('plugin.json parses as JSON', () => {});

  t('name is a string', () => {
    if (typeof plugin.name !== 'string' || !plugin.name) throw new Error(`name must be a non-empty string, got ${JSON.stringify(plugin.name)}`);
  });

  // #42: the schema types `repository` as a string URL. The npm convention
  // ({ type, url }) is a load error ("repository: expected string, received object").
  t('repository is a STRING url, not an npm {type,url} object (#42)', () => {
    if (!('repository' in plugin)) return; // optional field; absent is fine
    if (typeof plugin.repository !== 'string') {
      throw new Error(`repository must be a string URL, got ${isObject(plugin.repository) ? 'an object (npm {type,url} form — this is the #42 bug)' : typeof plugin.repository}`);
    }
    if (!/^https?:\/\//.test(plugin.repository)) throw new Error(`repository should be a URL, got "${plugin.repository}"`);
  });

  t('homepage, if present, is a string', () => {
    if ('homepage' in plugin && typeof plugin.homepage !== 'string') {
      throw new Error(`homepage must be a string, got ${typeof plugin.homepage}`);
    }
  });

  // The schema types `author` as an object (name/email/url) — the inverse of
  // repository. A bare string here would also mismatch.
  t('author, if present, is an object (name/email/url)', () => {
    if ('author' in plugin && !isObject(plugin.author)) {
      throw new Error(`author must be an object, got ${Array.isArray(plugin.author) ? 'an array' : typeof plugin.author}`);
    }
    if (isObject(plugin.author) && typeof plugin.author.name !== 'string') {
      throw new Error('author.name must be a string');
    }
  });

  t('version, if present, is a string', () => {
    if ('version' in plugin && typeof plugin.version !== 'string') {
      throw new Error(`version must be a string, got ${typeof plugin.version}`);
    }
  });

  // Drift guard: we shipped plugin.json behind the VERSION file twice. They
  // must agree so the published plugin version matches what we tag/release.
  t('plugin.json version matches the VERSION file (drift guard)', () => {
    if (!fs.existsSync(VERSION_FILE)) throw new Error('VERSION file missing');
    const v = fs.readFileSync(VERSION_FILE, 'utf8').trim();
    if (plugin.version !== v) {
      throw new Error(`plugin.json version (${plugin.version}) != VERSION file (${v}) — bump both together`);
    }
  });
}

console.log('\n--- marketplace.json (Claude Code marketplace schema) ---');

const market = (() => { try { return readJson(MARKET); } catch (e) { bad('marketplace.json parses', e.message); return null; } })();

if (market) {
  t('marketplace.json parses as JSON', () => {});

  t('name is a string', () => {
    if (typeof market.name !== 'string' || !market.name) throw new Error(`name must be a non-empty string, got ${JSON.stringify(market.name)}`);
  });

  // #36: `owner` is a REQUIRED top-level object with a required `name`. Its
  // absence is the exact "owner: expected object, received undefined" error
  // that blocked `/plugin marketplace add`.
  t('owner is a required object with a name (#36)', () => {
    if (!('owner' in market)) throw new Error('owner is REQUIRED and missing — this is the #36 bug (/plugin marketplace add fails schema validation)');
    if (!isObject(market.owner)) throw new Error(`owner must be an object, got ${typeof market.owner}`);
    if (typeof market.owner.name !== 'string' || !market.owner.name) throw new Error('owner.name must be a non-empty string');
  });

  // The owner schema defines only name + email — no `url`. Catching a stray
  // url here stops us "fixing" #36 with an invalid field (a tempting mistake).
  t('owner has no invalid `url` field (only name/email are defined)', () => {
    if (isObject(market.owner) && 'url' in market.owner) {
      throw new Error('owner.url is not a defined field; the owner schema is name + email only');
    }
  });

  t('plugins is a non-empty array', () => {
    if (!Array.isArray(market.plugins) || market.plugins.length === 0) {
      throw new Error('plugins must be a non-empty array');
    }
  });

  t('each plugin entry has name + source (string)', () => {
    market.plugins.forEach((p, i) => {
      if (!isObject(p)) throw new Error(`plugins[${i}] must be an object`);
      if (typeof p.name !== 'string' || !p.name) throw new Error(`plugins[${i}].name must be a non-empty string`);
      if (typeof p.source !== 'string' || !p.source) throw new Error(`plugins[${i}].source must be a non-empty string`);
    });
  });

  // #36 follow-on: a per-plugin `version` pin only updates when the string
  // changes, so it silently freezes users on a stale version (it was stuck at
  // 0.1.44 while the plugin was 0.7.x). plugin.json's version is the source of
  // truth; the marketplace entry should not also pin one.
  t('no stale per-plugin version pin in marketplace entries (#36)', () => {
    market.plugins.forEach((p, i) => {
      if ('version' in p) {
        throw new Error(`plugins[${i}] sets version="${p.version}"; remove it so plugin.json's version is the single source of truth (a marketplace pin goes stale silently)`);
      }
    });
  });
}

// --- single-source-of-truth: every version string in the repo must agree ---
//
// Version drift has bitten this repo repeatedly: plugin.json fell behind the
// VERSION file twice, and marketplace.json sat frozen at 0.1.44 while the
// plugin was 0.7.x (#36). The plugin.json drift guard above covers one pair;
// this gathers EVERY place a release version can live and asserts they're all
// equal, so re-introducing any source can't silently diverge. If a new version
// source is added later, add it here too.
console.log('\n--- version single-source-of-truth (drift guard) ---');

if (plugin && market) {
  t('VERSION, plugin.json, and any marketplace version all agree', () => {
    if (!fs.existsSync(VERSION_FILE)) throw new Error('VERSION file missing');
    const canonical = fs.readFileSync(VERSION_FILE, 'utf8').trim();

    const sources = [
      ['VERSION file', canonical],
      ['plugin.json .version', plugin.version],
    ];
    // marketplace top-level version is optional; include it only if present.
    if ('version' in market) sources.push(['marketplace.json .version', market.version]);
    // per-plugin versions are forbidden above, but if one sneaks in, fold it
    // into the equality check so the failure names the real divergence.
    market.plugins.forEach((p, i) => {
      if ('version' in p) sources.push([`marketplace.json plugins[${i}].version`, p.version]);
    });

    const disagree = sources.filter(([, v]) => v !== canonical);
    if (disagree.length) {
      const detail = sources.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
      throw new Error(`version sources disagree (canonical = VERSION file ${JSON.stringify(canonical)}): ${detail}`);
    }
  });
}

console.log('');
if (fail) { console.log(`${pass} passed, ${fail} failed.`); process.exit(1); }
console.log(`${pass} passed, 0 failed.`);
