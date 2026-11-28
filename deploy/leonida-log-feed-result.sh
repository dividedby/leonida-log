#!/usr/bin/env bash
# Counts consecutive failed KeenGamer feed polls and alerts once, on the second. Installed by the owner as
# /usr/local/sbin/leonida-log-feed-result (root:root 0755; deploy/install-host.sh does it) and run by
# leonida-log-feed.service as `ExecStopPost=-`, after every poll, with systemd's SERVICE_RESULT, EXIT_CODE and
# EXIT_STATUS in the environment.
#
# Why two: the feed holds about 9 hours of items and the timer fires every 4, so one failed poll is routine (a 5xx,
# a timeout) and the next poll still sees everything. A second one in a row is where articles start to drop.
#
# What counts (SuccessExitStatus=75 makes systemd report a lock-yield as SERVICE_RESULT=success, so it is told apart
# by EXIT_STATUS):
#   - SERVICE_RESULT=success, EXIT_STATUS=75: the poll never ran (a deploy or the weekly scrape held the lock). It
#     says nothing about the feed, so the count stays as it is: not a failure, not a reset.
#   - any other success: the feed was read, the count goes back to 0.
#   - anything else (exit-code, timeout, signal, ...): a failure; the count goes up by one, and exactly at 2 the
#     alert starts (the same host-alert@ instance form the weekly scrape's OnFailure= uses). 3, 4, ... stay quiet
#     until a success resets the count.
#   - no SERVICE_RESULT (run by hand): nothing happens.
#
# The count lives in STATE_DIR (root-owned /var/lib/leonida-log-deploy, not the data folder the scraper container
# mounts read-write). The script always exits 0: a failing ExecStopPost would turn the unit's result into
# exit-code and hide the real one. Problems go to stderr (the journal).
#
# STATE_DIR and SYSTEMCTL exist so tests can point the script at stubs.
set -euo pipefail

STATE_DIR=${STATE_DIR:-/var/lib/leonida-log-deploy}
SYSTEMCTL=${SYSTEMCTL:-systemctl}
UNIT=leonida-log-feed.service
ALERT_AT=2
COUNT_FILE=$STATE_DIR/feed-failures

record() {
  local result=${SERVICE_RESULT:-} code=${EXIT_CODE:-} status=${EXIT_STATUS:-}

  [[ -n $result ]] || return 0
  if [[ $result == success ]]; then
    [[ $code == exited && $status == 75 ]] && return 0
    rm -f "$COUNT_FILE"
    return 0
  fi

  [[ -d $STATE_DIR ]] || {
    echo "feed-result: ERROR: no state folder at $STATE_DIR; failure not counted" >&2
    return 0
  }
  local count=0 tmp
  if [[ -r $COUNT_FILE ]]; then
    read -r count <"$COUNT_FILE" || true
  fi
  [[ $count =~ ^[0-9]{1,9}$ ]] || count=0
  count=$((10#$count + 1))

  tmp=$(mktemp "$STATE_DIR/.feed-failures.XXXXXX")
  echo "$count" >"$tmp"
  mv -f "$tmp" "$COUNT_FILE"

  if ((count == ALERT_AT)); then
    "$SYSTEMCTL" start --no-block "host-alert@attention:$UNIT.service" ||
      echo "feed-result: ERROR: could not start the alert for $count failed polls in a row" >&2
  fi
}

record || echo "feed-result: ERROR: could not record the poll result" >&2
exit 0
