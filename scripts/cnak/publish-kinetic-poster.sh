#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
FOLDER=${CNAK_FOLDER:-CNAK-formen-der-abweichung-garten-golum-kinetic-001}
SOURCE=${CNAK_OUTPUT_DIR:-"$ROOT/tmp/$FOLDER"}
TARGET="$ROOT/lib/GENERATIONS/$FOLDER"
[ -f "$SOURCE/video/formen-der-abweichung-kinetic-v001.mp4" ] || { echo "missing rendered video: $SOURCE" >&2; exit 1; }
[ ! -e "$TARGET" ] || { echo "refuse overwrite frozen public folder: $TARGET" >&2; exit 1; }
mkdir -p "$TARGET"
cp -R "$SOURCE/." "$TARGET/"
POSTER=$(basename "$(find "$TARGET/source" -maxdepth 1 -type f \( -name '*.jpg' -o -name '*.jpeg' \) | head -n 1)")
cat > "$TARGET/index.html" <<HTML
<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Formen der Abweichung — Garten-Golum</title><style>body{margin:0;background:#111;color:#eee;font:16px system-ui;text-align:center}main{max-width:720px;margin:auto;padding:2rem 1rem}img,video{display:block;width:100%;height:auto;margin:1rem 0}small{color:#aaa}</style><main><h1>Formen der Abweichung</h1><p>Garten-Golum — kinetic poster test</p><small>CNAK kinetic test 001</small><img src="source/$POSTER" alt="Original Garten-Golum poster"><video controls playsinline src="video/formen-der-abweichung-kinetic-v001.mp4"></video><img src="preview/final-frame.jpg" alt="Final kinetic poster frame"></main>
HTML
echo "published locally: $TARGET"
