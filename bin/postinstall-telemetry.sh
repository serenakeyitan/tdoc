#!/usr/bin/env bash
# postinstall-telemetry.sh — substitute absolute path placeholders in
# SKILL.md so the telemetry block references this machine's tdoc install.
#
# Run this once after git clone (or after `git pull` if the SKILL.md
# template was updated). Idempotent — safe to re-run.
#
# Why: Claude reads SKILL.md and executes the bash blocks verbatim. It
# can't resolve `$0` or `$(dirname ...)` reliably because SKILL.md isn't
# a script. So we bake the absolute path in at install time.

set -euo pipefail

# Resolve the tdoc install directory (parent of this script's bin/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TDOC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SKILL_MD="$TDOC_DIR/SKILL.md"
TELEMETRY_DIR="$TDOC_DIR/telemetry"

if [ ! -f "$SKILL_MD" ]; then
  echo "ERROR: $SKILL_MD not found." >&2
  echo "Run this from inside a tdoc clone, after cloning the repo." >&2
  exit 1
fi

if [ ! -d "$TELEMETRY_DIR" ]; then
  echo "ERROR: $TELEMETRY_DIR not found." >&2
  echo "The telemetry/ directory should be part of the tdoc repo." >&2
  exit 1
fi

# Check if SKILL.md still has the placeholder
if grep -q "__TDOC_DIR__" "$SKILL_MD"; then
  echo "Substituting __TDOC_DIR__ → $TDOC_DIR in SKILL.md..."
  # Use a temp file + mv to be atomic
  TMP="$(mktemp)"
  sed "s|__TDOC_DIR__|$TDOC_DIR|g" "$SKILL_MD" > "$TMP"
  mv "$TMP" "$SKILL_MD"
  echo "✅ done"
else
  # Maybe already substituted from a previous run. Check if it points
  # at the right TDOC_DIR. If a different path, fix it.
  CURRENT_PATH=$(grep -oE '"/[^"]+/telemetry/bin/telemetry-log"' "$SKILL_MD" | head -1 | tr -d '"')
  if [ -n "$CURRENT_PATH" ] && [ "$CURRENT_PATH" != "$TDOC_DIR/telemetry/bin/telemetry-log" ]; then
    echo "SKILL.md has stale path: $CURRENT_PATH"
    echo "Fixing to: $TDOC_DIR/telemetry/bin/telemetry-log"
    OLD_TDOC_DIR=$(echo "$CURRENT_PATH" | sed 's|/telemetry/bin/telemetry-log||')
    TMP="$(mktemp)"
    sed "s|$OLD_TDOC_DIR|$TDOC_DIR|g" "$SKILL_MD" > "$TMP"
    mv "$TMP" "$SKILL_MD"
    echo "✅ updated"
  else
    echo "SKILL.md already references the correct path: $TDOC_DIR"
    echo "✅ nothing to do"
  fi
fi

# Make sure the telemetry bins are executable
chmod +x "$TELEMETRY_DIR/bin/"* 2>/dev/null || true

# Verify the substitution
if grep -q "__TDOC_DIR__" "$SKILL_MD"; then
  echo "❌ ERROR: __TDOC_DIR__ still present in SKILL.md after sed" >&2
  exit 1
fi

echo ""
echo "Postinstall complete. Telemetry will:"
echo "  - Prompt you for consent on first /tdoc invocation"
echo "  - Record outcome/duration of each tdoc run to ~/.tdoc/telemetry/"
echo "  - Sync to Supabase in background (unless SKILL_TELEMETRY=off)"
echo ""
echo "To opt out: export SKILL_TELEMETRY=off"
echo "To see what's recorded: see telemetry/PRIVACY.md"
