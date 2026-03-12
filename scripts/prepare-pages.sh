#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/.site}"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

copy_path() {
    local relative_path="$1"
    local source_path="$ROOT_DIR/$relative_path"
    local target_path="$OUT_DIR/$relative_path"

    if [ ! -e "$source_path" ]; then
        echo "skip missing: $relative_path"
        return 0
    fi

    mkdir -p "$(dirname "$target_path")"
    cp -R "$source_path" "$target_path"
}

copy_path "index.html"
copy_path "game-intro.html"
copy_path "assets"
copy_path "audio"
copy_path "css"
copy_path "js"

touch "$OUT_DIR/.nojekyll"

if [ -f "$OUT_DIR/index.html" ] && [ ! -f "$OUT_DIR/404.html" ]; then
    cp "$OUT_DIR/index.html" "$OUT_DIR/404.html"
fi

echo "Prepared GitHub Pages artifact at: $OUT_DIR"
find "$OUT_DIR" -maxdepth 2 -type f | sort
