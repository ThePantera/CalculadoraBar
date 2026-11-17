#!/usr/bin/env bash
# Corre las pruebas sin Node, usando Edge o Chrome sin interfaz.
# Uso: bash tests/run.sh      (si tenés Node: node --test tests/)
set -u
cd "$(dirname "$0")/.." || exit 2
BROWSER=""
for c in \
  "/c/Program Files/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  "/c/Program Files/Microsoft/Edge/Application/msedge.exe"; do
  [ -x "$c" ] && BROWSER="$c" && break
done
[ -z "$BROWSER" ] && { echo "RESULT: no se encontró Edge ni Chrome"; exit 2; }
URL="file:///$(pwd -W 2>/dev/null || pwd)/tests/runner.html"
OUT=$("$BROWSER" --headless=new --disable-gpu --allow-file-access-from-files \
  --virtual-time-budget=8000 --dump-dom "$URL" 2>/dev/null)
# Mostrar el texto del <pre> (las líneas PASS/FAIL y RESULT)
echo "$OUT" | sed -n '/<pre id="out">/,/<\/pre>/p' | sed -e 's/<pre id="out">//' -e 's/<\/pre>//' | sed -e 's/&gt;/>/g' -e 's/&lt;/</g' -e 's/&amp;/\&/g'
echo "$OUT" | grep -q "RESULT: [0-9]* passed, 0 failed" || exit 1
