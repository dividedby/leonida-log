#!/usr/bin/env bash
# Runs the scrapers once from the image that is currently deployed. Installed by the owner as
# /usr/local/sbin/leonida-log-scrape (root:root 0755; deploy/install-host.sh does it) and started by
# leonida-log-scrape.service, which the weekly timer triggers; run it by hand the same way
# (`systemctl start leonida-log-scrape.service`). Extra arguments go to the scraper CLI.
#
# Exit status is the scraper's: 0 done, 1 bad setup, 2 a source's listing could not be read. The unit fails on
# any non-zero status, and that alerts. The report is written to /var/lib/leonida-log/reports.
#
# COMPOSE_FILE, ENV_FILE, STATE_DIR and DOCKER exist so tests can point the script at stubs.
set -euo pipefail

COMPOSE_FILE=${COMPOSE_FILE:-/etc/leonida-log/compose.yaml}
ENV_FILE=${ENV_FILE:-/etc/leonida-log/compose.env}
STATE_DIR=${STATE_DIR:-/var/lib/leonida-log-deploy}
DOCKER=${DOCKER:-docker}

tag=""
if [[ -r $STATE_DIR/current ]]; then
  read -r tag <"$STATE_DIR/current" || true
fi
if [[ ! $tag =~ ^[0-9a-f]{40}$ ]]; then
  echo "scrape: ERROR: no deployed release recorded in $STATE_DIR/current" >&2
  exit 1
fi

export IMAGE_TAG=$tag
exec "$DOCKER" compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm -T scraper "$@"
