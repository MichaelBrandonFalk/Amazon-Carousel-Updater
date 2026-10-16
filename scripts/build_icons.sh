#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ICONSET="$ROOT/.build/AppIcon.iconset"
mkdir -p "$ICONSET"
for SIZE in 16 32 128 256 512; do
  sips -z "$SIZE" "$SIZE" Resources/app-logo.png --out "$ICONSET/icon_${SIZE}x${SIZE}.png" >/dev/null
  DOUBLE=$((SIZE * 2))
  sips -z "$DOUBLE" "$DOUBLE" Resources/app-logo.png --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o Resources/AppIcon.icns
sips -z 256 256 Resources/app-logo.png --out website/dist/app-icon.png >/dev/null
for SIZE in 16 32; do
  sips -z "$SIZE" "$SIZE" Resources/app-logo.png --out "website/dist/favicon-${SIZE}.png" >/dev/null
done
sips -z 180 180 Resources/app-logo.png --out website/dist/apple-touch-icon.png >/dev/null
