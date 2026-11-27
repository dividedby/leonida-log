#!/usr/bin/env bash
# Runs a release on the host: pulls the image CI pushed for one commit, snapshots the database, migrates,
# restarts the app and checks it reports that commit. Installed by the owner as /usr/local/sbin/leonida-log-apply
# (root:root 0755; deploy/install-host.sh does it). It runs as root, and the `leonida-log` user may start it only
# through one sudoers rule, from leonida-log-deploy. Docker is root-equivalent, so nothing else gets that access.
#
#   leonida-log-apply <40-hex commit sha>
#
# Order (the SHA is re-validated here; the caller is not trusted):
#   1. compose pull app; a failure changes nothing;
#   2. VACUUM INTO a snapshot of the database as the service user (newest 3 kept); a failure changes nothing;
#   3. compose run --rm migrate; a failure leaves the old app running;
#   4. compose up -d app, then poll /api/health up to HEALTH_TRIES times for "revision":"<sha>";
#   5. unhealthy: start the previous release again (from $STATE_DIR/current), poll, exit 1;
#   6. healthy: record the SHA in $STATE_DIR/current, print "done: running <sha>", remove the other images of this
#      repo, and warn when the installed copies lag the clone's.
#
# The database is NOT rolled back. A migration must stay readable by the previous image (expand, then contract;
# see deploy/README.md), or step 5 leaves a broken app. The compose file is the root-owned copy in /etc/leonida-log;
# only the image tag changes per deploy.
#
# The settings below are overridable so tests can run the script against stubs. Under sudo the environment is
# reset, so the CI key cannot change them.
set -euo pipefail

COMPOSE_FILE=${COMPOSE_FILE:-/etc/leonida-log/compose.yaml}
ENV_FILE=${ENV_FILE:-/etc/leonida-log/compose.env}
STATE_DIR=${STATE_DIR:-/var/lib/leonida-log-deploy}
DATA_DIR=${DATA_DIR:-/var/lib/leonida-log}
HEALTH_TRIES=${HEALTH_TRIES:-60}
HEALTH_PAUSE=${HEALTH_PAUSE:-1}
DOCKER=${DOCKER:-docker}
# Prefix that runs a command as the service user. Empty string: run as the caller.
RUN_AS=${RUN_AS-runuser -u leonida-log --}
REPO=${REPO:-/srv/leonida-log}
SBIN_DIR=${SBIN_DIR:-/usr/local/sbin}
UNIT_DIR=${UNIT_DIR:-/etc/systemd/system}
IMAGE_REPO=ghcr.io/dividedby/leonida-log

log() { printf '%s apply: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() {
  log "ERROR: $*" >&2
  exit 1
}

[[ $HEALTH_TRIES =~ ^[1-9][0-9]{0,3}$ ]] || die "HEALTH_TRIES must be a positive integer"
[[ $HEALTH_PAUSE =~ ^[0-9]{1,3}$ ]] || die "HEALTH_PAUSE must be a whole number of seconds"

[[ $# -eq 1 && $1 =~ ^[0-9a-f]{40}$ ]] || die "usage: leonida-log-apply <40-character lowercase hex commit SHA>"
sha=$1

[[ -r $ENV_FILE ]] || die "cannot read $ENV_FILE"
[[ -r $COMPOSE_FILE ]] || die "cannot read $COMPOSE_FILE"
[[ -d $STATE_DIR ]] || die "no state folder at $STATE_DIR"
# Compose would create a missing bind source as root; the installer makes it, owned by the service user.
[[ -d $DATA_DIR ]] || die "no data folder at $DATA_DIR"

if [[ -z ${HEALTH_URL:-} ]]; then
  port=$(sed -n 's/^LEONIDA_PORT=//p' "$ENV_FILE" 2>/dev/null | tail -n1 || true)
  port=${port//[\"\']/}
  port=${port:-5100}
  [[ $port =~ ^[0-9]{1,5}$ ]] || die "LEONIDA_PORT in $ENV_FILE is not a port number"
  HEALTH_URL=http://127.0.0.1:$port/api/health
fi

exec 9>"$STATE_DIR/apply.lock"
flock -w 600 9 || die "another apply holds the lock"

prev=""
if [[ -r $STATE_DIR/current ]]; then
  read -r prev <"$STATE_DIR/current" || true
fi
[[ $prev =~ ^[0-9a-f]{40}$ ]] || prev=""

compose() {
  local tag=$1
  shift
  IMAGE_TAG=$tag "$DOCKER" compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

as_service() {
  if [[ -n $RUN_AS ]]; then
    local -a prefix
    read -ra prefix <<<"$RUN_AS"
    "${prefix[@]}" "$@"
  else
    "$@"
  fi
}

healthy() {
  local rev=$1 i body
  for ((i = 0; i < HEALTH_TRIES; i++)); do
    if body=$(curl -fsS --max-time 3 "$HEALTH_URL" 2>/dev/null) && [[ $body == *"\"revision\":\"$rev\""* ]]; then
      return 0
    fi
    sleep "$HEALTH_PAUSE"
  done
  return 1
}

# A consistent copy of the live database, taken as the service user so the files stay owned by it.
snapshot() {
  local db=$DATA_DIR/leonida.db dir=$DATA_DIR/pre-deploy f n=0
  if [[ ! -f $db ]]; then
    log "no database yet: no snapshot"
    return 0
  fi
  # Called as `snapshot || die`, where errexit is off, so every step reports its own failure.
  as_service mkdir -p -- "$dir" || return 1
  as_service rm -f -- "$dir/$sha.db" || return 1
  as_service sqlite3 "$db" "VACUUM INTO '$dir/$sha.db'" || return 1
  log "snapshot: $dir/$sha.db"
  while IFS= read -r f; do
    [[ $f =~ ^[0-9a-f]{40}\.db$ ]] || continue
    if ((++n > 3)); then
      as_service rm -f -- "$dir/$f" || return 1
    fi
  done < <(as_service ls -1t "$dir")
}

start() {
  local tag=$1
  compose "$tag" up -d app || return 1
  healthy "$tag"
}

rollback() {
  if [[ -z $prev ]]; then
    log "no previous release to roll back to; stopping the failed app"
    compose "$sha" stop app || true
    return 0
  fi
  log "rolling back to $prev"
  if start "$prev"; then
    log "rolled back, healthy"
  else
    log "ROLLBACK ALSO UNHEALTHY"
  fi
}

prune_images() {
  local ref
  while IFS= read -r ref; do
    if [[ $ref == "$IMAGE_REPO:$sha" ]]; then
      continue
    fi
    "$DOCKER" rmi "$ref" >/dev/null 2>&1 || true
  done < <("$DOCKER" image ls "$IMAGE_REPO" --format '{{.Repository}}:{{.Tag}}')
}

# The installed copies are root-owned and only the owner updates them; say so when they lag the clone.
warn_drift() {
  local src=$1 dest=$2 cur=$REPO part
  local -a parts
  # The clone is the service user's: skip a source reached through a symlink at any level, so root never
  # compares a file from somewhere else.
  [[ ! -L $cur ]] || return 0
  IFS=/ read -ra parts <<<"${src#"$REPO"/}"
  for part in "${parts[@]}"; do
    cur+=/$part
    [[ ! -L $cur ]] || return 0
  done
  [[ -f $src ]] || return 0
  if ! cmp -s "$src" "$dest"; then
    log "WARNING: $dest differs from ${src#"$REPO"/}; review it and re-run deploy/install-host.sh"
  fi
}

log "applying $sha (current: ${prev:-none})"

compose "$sha" pull app || die "pull of the image for $sha failed; nothing changed"
snapshot || die "pre-deploy snapshot failed; nothing changed"
compose "$sha" run --rm -T migrate || die "migration failed; the running app was not touched"

if ! start "$sha"; then
  log "the app did not report $sha"
  rollback
  exit 1
fi

printf '%s\n' "$sha" >"$STATE_DIR/current.tmp"
mv -f "$STATE_DIR/current.tmp" "$STATE_DIR/current"
log "done: running $sha"

prune_images

if [[ -d $REPO/deploy ]]; then
  warn_drift "$REPO/deploy/leonida-log-deploy.sh" "$SBIN_DIR/leonida-log-deploy"
  warn_drift "$REPO/deploy/leonida-log-apply.sh" "$SBIN_DIR/leonida-log-apply"
  warn_drift "$REPO/deploy/leonida-log-scrape.sh" "$SBIN_DIR/leonida-log-scrape"
  warn_drift "$REPO/compose.yaml" "$COMPOSE_FILE"
  warn_drift "$REPO/deploy/leonida-log-scrape.service" "$UNIT_DIR/leonida-log-scrape.service"
  warn_drift "$REPO/deploy/leonida-log-scrape.timer" "$UNIT_DIR/leonida-log-scrape.timer"
  warn_drift "$REPO/deploy/leonida-log-feed.service" "$UNIT_DIR/leonida-log-feed.service"
  warn_drift "$REPO/deploy/leonida-log-feed.timer" "$UNIT_DIR/leonida-log-feed.timer"
fi
