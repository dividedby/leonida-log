#!/usr/bin/env bash
# Smoke test for a built image, run by CI before the push and by hand on a laptop:
#
#   deploy/image-smoke.sh <image> <revision>
#
# It runs the image the way compose.yaml does (non-root uid, read-only root, no capabilities, tmpfs for /tmp
# and .next/cache) against a scratch /data: migrate, start the app and wait for /api/health to report the
# revision, then load the scraper entry point with --help. Nothing here touches the network beyond localhost.
set -euo pipefail

[[ $# -eq 2 ]] || {
  echo "usage: image-smoke.sh <image> <revision>" >&2
  exit 2
}
image=$1
revision=$2
DOCKER=${DOCKER:-docker}
HEALTH_TRIES=${HEALTH_TRIES:-30}

data=$(mktemp -d)
name=leonida-smoke-$$
cleanup() {
  "$DOCKER" rm -f "$name" >/dev/null 2>&1 || true
  rm -rf "$data"
}
trap cleanup EXIT

run_args=(
  --user "$(id -u):$(id -g)"
  --read-only --pids-limit 256 --cap-drop ALL --security-opt no-new-privileges:true
  --tmpfs /tmp --tmpfs /app/.next/cache
  -v "$data:/data"
  -e DATABASE_PATH=/data/leonida.db
  -e SCRAPE_REPORT_DIR=/data/reports
)

echo "smoke: migrate"
"$DOCKER" run --rm "${run_args[@]}" "$image" node scripts/migrate.mjs

echo "smoke: start the app"
"$DOCKER" run -d --name "$name" -p 127.0.0.1::3000 "${run_args[@]}" "$image" >/dev/null
port=$("$DOCKER" port "$name" 3000/tcp | head -n1 | sed 's/.*://')
[[ $port =~ ^[0-9]+$ ]] || {
  echo "smoke: ERROR: no published port" >&2
  exit 1
}

for ((i = 0; i < HEALTH_TRIES; i++)); do
  if body=$(curl -fsS --max-time 3 "http://127.0.0.1:$port/api/health" 2>/dev/null) &&
    [[ $body == *"\"revision\":\"$revision\""* ]]; then
    echo "smoke: health ok: $body"
    break
  fi
  sleep 1
done
if ((i == HEALTH_TRIES)); then
  echo "smoke: ERROR: /api/health never reported revision $revision" >&2
  "$DOCKER" logs "$name" >&2 || true
  exit 1
fi

echo "smoke: scraper entry point"
"$DOCKER" run --rm "${run_args[@]}" "$image" node node_modules/tsx/dist/cli.mjs scrapers/cli.ts --help >/dev/null

echo "smoke: ok"
