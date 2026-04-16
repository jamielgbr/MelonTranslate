#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
CHROME_DIR="$DIST_DIR/chrome"
FIREFOX_DIR="$DIST_DIR/firefox"
PRIMARY_MANIFEST="$ROOT_DIR/manifest.json"
CHROMIUM_MANIFEST="$ROOT_DIR/manifest.chromium.json"

extract_worker_entry_scripts() {
  sed -n '/importScripts(/,/);/p' "$ROOT_DIR/src/background/worker-entry.js" \
    | grep -o "'[^']*'" \
    | tr -d "'" \
    | sed 's#^\.\./#src/#; s#^\./#src/background/#'
}

extract_background_scripts() {
  awk '
    /"background"[[:space:]]*:[[:space:]]*\{/ { in_background=1; next }
    in_background && /"scripts"[[:space:]]*:[[:space:]]*\[/ { in_scripts=1; next }
    in_scripts && /^[[:space:]]*\]/ { exit }
    in_scripts { print }
  ' "$PRIMARY_MANIFEST" \
    | sed -n 's/^[[:space:]]*"\([^"]*\)"[,]\{0,1\}[[:space:]]*$/\1/p'
}

extract_content_scripts() {
  local manifest_path="$1"
  awk '
    /"content_scripts"[[:space:]]*:[[:space:]]*\[/ { in_content=1; next }
    in_content && /"js"[[:space:]]*:[[:space:]]*\[/ { in_js=1; next }
    in_js && /^[[:space:]]*\]/ { exit }
    in_js { print }
  ' "$manifest_path" \
    | sed -n 's/^[[:space:]]*"\([^"]*\)"[,]\{0,1\}[[:space:]]*$/\1/p'
}

validate_manifest_wiring() {
  if ! diff -u <(extract_worker_entry_scripts) <(extract_background_scripts); then
    echo "Primary Firefox manifest background.scripts is out of sync with src/background/worker-entry.js" >&2
    exit 1
  fi

  if ! diff -u <(extract_content_scripts "$PRIMARY_MANIFEST") <(extract_content_scripts "$CHROMIUM_MANIFEST"); then
    echo "Content script arrays differ between manifest.json and manifest.chromium.json" >&2
    exit 1
  fi
}

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
