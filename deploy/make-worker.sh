#!/usr/bin/env bash
# Usage: make-worker.sh <worker-name>
# Run in a project root after `npm run build` has produced dist/index.html.
# Writes worker.js (serves dist/index.html and every other file under dist/)
# and wrangler.jsonc. Single-file (vite-plugin-singlefile) builds need no asset upload.
set -euo pipefail
name=${1:?worker name required}
test -f dist/index.html || { echo "::error::dist/index.html not found" >&2; exit 1; }

imports=$(mktemp)
entries=$(mktemp)
exts=$(mktemp)
i=0
while IFS= read -r f; do
  rel=${f#dist/}
  ext=$(printf '%s' "${rel##*.}" | tr '[:upper:]' '[:lower:]')
  case "$ext" in js|mjs) echo "::error::JavaScript file in dist/ ($rel): this generator expects a single-file build" >&2; exit 1 ;; esac
  echo "$ext" >> "$exts"
  case "$ext" in
    jpg|jpeg) ct=image/jpeg ;;
    png) ct=image/png ;;
    webp) ct=image/webp ;;
    gif) ct=image/gif ;;
    svg) ct=image/svg+xml ;;
    ico) ct=image/x-icon ;;
    mp3) ct=audio/mpeg ;;
    ogg) ct=audio/ogg ;;
    wav) ct=audio/wav ;;
    woff2) ct=font/woff2 ;;
    woff) ct=font/woff ;;
    ttf) ct=font/ttf ;;
    otf) ct=font/otf ;;
    json) ct=application/json ;;
    css) ct=text/css ;;
    js|mjs) ct=text/javascript ;;
    txt) ct=text/plain ;;
    wasm) ct=application/wasm ;;
    *) ct=application/octet-stream ;;
  esac
  path=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote("/" + sys.argv[1]))' "$rel")
  echo "import f$i from \"./dist/$rel\";" >> "$imports"
  echo "  \"$path\": [f$i, \"$ct\"]," >> "$entries"
  i=$((i + 1))
done < <(find dist -type f ! -name index.html | sort)

{
  echo 'import html from "./dist/index.html";'
  cat "$imports"
  echo 'const files = {'
  cat "$entries"
  echo '};'
  cat <<'JS'
export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const file = files[pathname];
    if (file) {
      return new Response(file[0], {
        headers: { "content-type": file[1], "cache-control": "public, max-age=86400" },
      });
    }
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  },
};
JS
} > worker.js
rm -f "$imports" "$entries"

globs=$(sort -u "$exts" | awk 'NF{printf "%s\"**/*.%s\"", (n++ ? ", " : ""), $0}')
rm -f "$exts"
cat > wrangler.jsonc <<JSON
{
  "name": "$name",
  "main": "worker.js",
  "compatibility_date": "2026-11-01",
  "rules": [
    { "type": "Text", "globs": ["**/*.html"], "fallthrough": false },
    { "type": "Data", "globs": [$globs], "fallthrough": false }
  ]
}
JSON
echo "Generated worker.js with $i asset(s) and wrangler.jsonc (name: $name)"
