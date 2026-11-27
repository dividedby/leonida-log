#!/usr/bin/env bash
# Runs the scrapers once from the image that is currently deployed. Installed by the owner as
# /usr/local/sbin/leonida-log-scrape (root:root 0755; deploy/install-host.sh does it) and started by
# leonida-log-scrape.service, which the weekly timer triggers; run it by hand the same way
# (`systemctl start leonida-log-scrape.service`). Extra arguments go to the scraper CLI; leonida-log-feed.service
# passes --feed-only for the 4-hourly KeenGamer feed poll.
#
# Exit status is the scraper's: 0 done, 1 bad setup, 2 a source's listing could not be read (a --feed-only run
# also exits 2 when its 180 s deadline passes). The weekly scrape unit fails on any non-zero status and alerts
# (OnFailure=). The feed unit fails on any non-zero status except 75, has no OnFailure=, and doesn't alert. A full
# run writes the report to /var/lib/leonida-log/reports; a --feed-only run writes none.
#
# --feed-only (the 4-hourly feed poll) gives way instead of queueing: it waits at most FEED_LOCK_WAIT seconds for
# the lock, and if a deploy or the weekly scrape still holds it, exits 75 without polling (the feed unit counts
# that as success). The scraper's own deadline keeps the wait plus the run under the unit's TimeoutStartSec, so a
# poll is never killed while it holds the lock.
#
# COMPOSE_FILE, ENV_FILE, STATE_DIR and DOCKER exist so tests can point the script at stubs.
set -euo pipefail

COMPOSE_FILE=${COMPOSE_FILE:-/etc/leonida-log/compose.yaml}
ENV_FILE=${ENV_FILE:-/etc/leonida-log/compose.env}
STATE_DIR=${STATE_DIR:-/var/lib/leonida-log-deploy}
DOCKER=${DOCKER:-docker}

[[ -d $STATE_DIR ]] || {
  echo "scrape: ERROR: no state folder at $STATE_DIR" >&2
  exit 1
}

# The lock apply uses, so a scrape never overlaps a migration or an image swap. Held until the run ends (exec
# keeps fd 9 open in docker); a deploy that starts meanwhile waits for it, up to its own 10-minute limit.
lock_wait=600
for arg in "$@"; do
  [[ $arg == --feed-only ]] && lock_wait=${FEED_LOCK_WAIT:-60}
done
exec 9>"$STATE_DIR/apply.lock"
if ! flock -w "$lock_wait" 9; then
  if ((lock_wait != 600)); then
    echo "scrape: feed poll skipped: the lock is held (a deploy or the weekly scrape); the next poll retries" >&2
    exit 75
  fi
  echo "scrape: ERROR: a deploy holds the lock" >&2
  exit 1
fi

# Read after the lock: a deploy that held it may have changed the release.
tag=""
if [[ -r $STATE_DIR/current ]]; then
  read -r tag <"$STATE_DIR/current" || true
fi
if [[ ! $tag =~ ^[0-9a-f]{40}$ ]]; then
  echo "scrape: ERROR: no deployed release recorded in $STATE_DIR/current" >&2
  exit 1
fi

export IMAGE_TAG=$tag
exec "$DOCKER" compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm -T --pull never scraper "$@"
