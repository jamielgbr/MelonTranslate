#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
CHROME_DIR="$DIST_DIR/chrome"
FIREFOX_DIR="$DIST_DIR/firefox"
PRIMARY_MANIFEST="$ROOT_DIR/manifest.json"
CHROMIUM_MANIFEST="$ROOT_DIR/manifest.chromium.json"

validate_manifest_wiring() {
  (cd "$ROOT_DIR" && node scripts/validate-manifest-wiring.mjs)
}

DEMO_MODE=false
if [[ "${1:-}" == "demo" ]]; then
  DEMO_MODE=true
fi

validate_manifest_wiring

rm -rf "$CHROME_DIR" "$FIREFOX_DIR"
mkdir -p "$CHROME_DIR" "$FIREFOX_DIR"

copy_variant() {
  local target_dir="$1"
  local manifest_source="$2"

  mkdir -p "$target_dir"
  cp -R "$ROOT_DIR/assets" "$target_dir/assets"
  cp -R "$ROOT_DIR/src" "$target_dir/src"
  cp "$manifest_source" "$target_dir/manifest.json"

  if [[ "$DEMO_MODE" == true ]]; then
    sed -i 's/"version"[[:space:]]*:[[:space:]]*"[^"]*"/"version": "999.9.9"/' "$target_dir/manifest.json"
  fi

  # Copy documentation
  for doc in README.md PRIVACY_POLICY.md PERMISSIONS.md LICENSE CHANGELOG.md; do
    if [[ -f "$ROOT_DIR/$doc" ]]; then
      cp "$ROOT_DIR/$doc" "$target_dir/$doc"
    fi
  done
}

copy_variant "$CHROME_DIR" "$CHROMIUM_MANIFEST"
copy_variant "$FIREFOX_DIR" "$PRIMARY_MANIFEST"

echo "Built Chrome variant: $CHROME_DIR"
echo "Built Firefox variant: $FIREFOX_DIR"
if [[ "$DEMO_MODE" == true ]]; then
  echo "Demo mode: version set to 999.9.9"
fi
