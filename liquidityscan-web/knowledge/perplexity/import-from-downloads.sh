#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$SCRIPT_DIR"
SRC="${1:-$HOME/Downloads/memory of liqscan}"
if [[ ! -d "$SRC" ]]; then
  echo "Source directory not found: $SRC" >&2
  echo "Usage: $0 [path-to-memory-of-liqscan-folder]" >&2
  exit 1
fi
shopt -s nullglob
files=("$SRC"/*.md)
if ((${#files[@]} == 0)); then
  echo "No .md files in: $SRC" >&2
  exit 1
fi
cp -v "${files[@]}" "$DEST/"
echo "Done. Copied ${#files[@]} file(s) -> $DEST"
