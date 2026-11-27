#!/usr/bin/env bash
# Entry point for a deploy of one commit of main. Installed by the owner as /usr/local/sbin/leonida-log-deploy
# (root:root 0755; deploy/install-host.sh does it) and run as the unprivileged `leonida-log` user, as the forced
# command of the CI key: the only input is the commit SHA the client sends, which reaches this script as
# SSH_ORIGINAL_COMMAND. The SHA must be 40 lowercase hex digits and an ancestor of origin/main, so the key can
# deploy main's history and nothing else.
#
# This script has no Docker access (the docker group is root). It validates, takes the lock, fetches main and
# checks the commit out (detached; the checkout is only a reference for the drift check), then hands the SHA to
# /usr/local/sbin/leonida-log-apply through the single sudoers rule. The image for that SHA was built and pushed by
# CI; the host only pulls it. Exit status is the apply script's. Prints no secrets.
#
# REPO and APPLY exist so tests can point the script at a scratch clone and a stub.
set -euo pipefail

REPO=${REPO:-/srv/leonida-log}
APPLY=${APPLY:-/usr/local/sbin/leonida-log-apply}

log() { printf '%s deploy: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() {
  log "ERROR: $*" >&2
  exit 1
}

sha="${SSH_ORIGINAL_COMMAND:-${1:-}}"
[[ $sha =~ ^[0-9a-f]{40}$ ]] || die "expected a 40-character lowercase hex commit SHA"

# The clone is writable by this user and holds whatever main holds: never read a ~/.gitconfig or any git config
# outside the clone's own .git/config. (The user's home is root-owned, outside the clone; install-host.sh sets it.)
export HOME=/nonexistent
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_NOSYSTEM=1
export GIT_TERMINAL_PROMPT=0
cd "$REPO" || die "no clone at $REPO"

# One deploy at a time; a second caller waits up to 10 minutes.
exec 9>"$REPO/.git/deploy.lock"
flock -w 600 9 || die "another deploy holds the lock"

git fetch --quiet origin '+refs/heads/main:refs/remotes/origin/main' || die "git fetch failed"
git cat-file -e "$sha^{commit}" 2>/dev/null || die "commit not found after fetch"
git merge-base --is-ancestor "$sha" origin/main || die "commit is not on origin/main"
git checkout --quiet --detach "$sha" || die "checkout of $sha failed"

log "deploying $sha"
# Not exec: the lock on fd 9 is held until this shell exits.
status=0
sudo -n "$APPLY" "$sha" || status=$?
exit "$status"
