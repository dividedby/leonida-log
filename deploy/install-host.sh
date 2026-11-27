#!/usr/bin/env bash
# One-time (and re-runnable) host setup for deploy-on-push. The owner runs it as root on the hosting machine:
#
#   bash /root/install-host.sh '<CI public key line>'    # first time: also authorizes the key
#   bash /root/install-host.sh                            # later: only reinstall the files
#   bash /root/install-host.sh --enable-scrape            # also enable the weekly scrape timer
#
# Run it from a copy that does NOT live in the service user's clone (the `leonida-log` user can rewrite
# /srv/leonida-log, and this script runs as root): copy deploy/install-host.sh, deploy/leonida-log-deploy.sh,
# deploy/leonida-log-apply.sh, deploy/leonida-log-scrape.sh, deploy/leonida-log-scrape.service,
# deploy/leonida-log-scrape.timer and compose.yaml from the owner's own checkout to /root/ (scp). It installs the
# files sitting next to itself, refuses files or a folder not owned by root, and never runs git as root.
#
# Docker, the compose plugin, sqlite3, flock, curl and git must already be installed; this script installs
# none of them, and refuses to continue if the service user is in the docker group (that group is root).
#
# What it does, in order (every step is safe to repeat):
#   1. creates the `leonida-log` user (no password, login shell for the forced command, a root-owned home outside the clone, not in docker) and the
#      folders: /etc/leonida-log, /var/lib/leonida-log (data, 0700), /var/lib/leonida-log-deploy (state), and a
#      clone of the public repo at /srv/leonida-log;
#   2. installs the three scripts in /usr/local/sbin and the root-owned compose.yaml in /etc/leonida-log, and
#      creates /etc/leonida-log/compose.env if it is missing (never overwrites it);
#   3. allows the user exactly one privileged command, the apply script (validated with visudo);
#   4. keeps the CI key in /etc/leonida-log/authorized_keys (root:leonida-log 0640), restricted to the deploy
#      script as a forced command with no pty, forwarding or agent;
#   5. adds an sshd drop-in that points ONLY the `leonida-log` user at that file, turns off passwords for it, and
#      checks root's settings are untouched before reloading sshd. It never edits root's config;
#   6. installs the scrape service and timer units; enables the timer only with --enable-scrape.
#
# Before running it: keep a second root SSH session open.
set -euo pipefail

SVC_USER=leonida-log
SRC_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CLONE=/srv/leonida-log
REPO_URL=https://github.com/dividedby/leonida-log.git
ETC_DIR=/etc/leonida-log
DATA_DIR=/var/lib/leonida-log
STATE_DIR=/var/lib/leonida-log-deploy
SBIN_DIR=/usr/local/sbin
UNIT_DIR=/etc/systemd/system
PRIV_DROPIN=/etc/sudoers.d/leonida-log-deploy
SSHD_DROPIN=/etc/ssh/sshd_config.d/60-leonida-log-deploy.conf
AK=$ETC_DIR/authorized_keys
DEPLOY_DEST=$SBIN_DIR/leonida-log-deploy
APPLY_DEST=$SBIN_DIR/leonida-log-apply
PORT=5100

die() {
  echo "install-host: $*" >&2
  exit 1
}

[[ $EUID -eq 0 ]] || die "run as root"

enable_scrape=0
key=""
for arg in "$@"; do
  case $arg in
  --enable-scrape) enable_scrape=1 ;;
  -*) die "usage: install-host.sh [--enable-scrape] ['<CI public key line>']" ;;
  *)
    [[ -z $key ]] || die "usage: install-host.sh [--enable-scrape] ['<CI public key line>']"
    key=$arg
    ;;
  esac
done

FILES=(
  leonida-log-deploy.sh
  leonida-log-apply.sh
  leonida-log-scrape.sh
  leonida-log-scrape.service
  leonida-log-scrape.timer
  compose.yaml
)
for name in "${FILES[@]}"; do
  f=$SRC_DIR/$name
  [[ -f $f ]] || die "missing $f (copy $name next to this script)"
  [[ ! -L $f ]] || die "$f is a symlink; copy the real file"
  [[ $(stat -c %u "$f") -eq 0 ]] || die "$f must be owned by root, not a clone the service user controls"
  (($((8#$(stat -c %a "$f") & 8#022)) == 0)) || die "$f must not be group- or world-writable"
done
[[ $(stat -c %u "$SRC_DIR") -eq 0 ]] || die "$SRC_DIR must be owned by root"
(($((8#$(stat -c %a "$SRC_DIR") & 8#022)) == 0)) || die "$SRC_DIR must not be group- or world-writable"

for cmd in docker sqlite3 flock curl git runuser visudo sshd systemctl; do
  command -v "$cmd" >/dev/null 2>&1 || die "$cmd is not installed"
done
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is not installed"

if [[ -n $key ]]; then
  [[ $key != *$'\n'* ]] || die "the key must be one line"
  read -r ktype kblob _ <<<"$key"
  case $ktype in
  ssh-* | ecdsa-* | sk-*) ;;
  *) die "the key line must start with the key type (ssh-ed25519 ...), without options" ;;
  esac
  ssh-keygen -l -f /dev/stdin <<<"$key" >/dev/null 2>&1 || die "ssh-keygen does not accept that key"
fi

tmp_files=()
cleanup() { rm -f "${tmp_files[@]}"; }
trap cleanup EXIT

# 1. The user and the folders.
if ! id -u "$SVC_USER" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$STATE_DIR" --no-create-home --shell /bin/bash "$SVC_USER"
  echo "created user $SVC_USER"
fi
# The home must be a root-owned folder the user cannot write to, never the clone: under a forced command bash
# can read ~/.bashrc and git reads ~/.gitconfig, and a file committed to main must not run as this user.
if [[ $(getent passwd "$SVC_USER" | cut -d: -f6) != "$STATE_DIR" ]]; then
  usermod -d "$STATE_DIR" "$SVC_USER"
  echo "set $SVC_USER's home to $STATE_DIR"
fi
# `*` is "no valid password" without locking the account, which some sshd setups refuse for key logins.
usermod -p '*' "$SVC_USER"
if [[ $(getent passwd "$SVC_USER" | cut -d: -f7) != /bin/bash ]]; then
  usermod -s /bin/bash "$SVC_USER"
  echo "set $SVC_USER's shell to /bin/bash"
fi
if id -nG "$SVC_USER" | tr ' ' '\n' | grep -qx docker; then
  die "$SVC_USER is in the docker group, which is root-equivalent; remove it (gpasswd -d $SVC_USER docker) and re-run"
fi

install -d -o root -g "$SVC_USER" -m 0750 "$ETC_DIR"
install -d -o "$SVC_USER" -g "$SVC_USER" -m 0700 "$DATA_DIR"
install -d -o root -g root -m 0755 "$STATE_DIR"
install -d -o "$SVC_USER" -g "$SVC_USER" -m 0755 "$CLONE"
if [[ ! -d $CLONE/.git ]]; then
  runuser -u "$SVC_USER" -- env HOME="$STATE_DIR" GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 \
    GIT_TERMINAL_PROMPT=0 git clone --quiet "$REPO_URL" "$CLONE"
  echo "cloned $REPO_URL to $CLONE"
fi

# 2. The scripts and compose.yaml. Copy first, then hash and install the copy, so the file can't be swapped
# between the hash and the install. Print the hashes so the owner can compare them with `shasum -a 256` on their
# own checkout. file_changed says whether the installed file differed.
file_changed=0
install_file() {
  local label=$1 src=$2 dest=$3 mode=$4 copy
  copy=$(mktemp)
  tmp_files+=("$copy")
  cp -- "$src" "$copy"
  case $src in
  *.sh) bash -n "$copy" || die "$src does not parse; nothing was installed from it" ;;
  esac
  echo "$label sha256: $(sha256sum "$copy" | cut -d' ' -f1)"
  file_changed=0
  cmp -s "$copy" "$dest" || file_changed=1
  install -o root -g root -m "$mode" "$copy" "$dest"
}

install_file "deploy script" "$SRC_DIR/leonida-log-deploy.sh" "$DEPLOY_DEST" 0755
install_file "apply script" "$SRC_DIR/leonida-log-apply.sh" "$APPLY_DEST" 0755
install_file "scrape script" "$SRC_DIR/leonida-log-scrape.sh" "$SBIN_DIR/leonida-log-scrape" 0755
install_file "compose.yaml" "$SRC_DIR/compose.yaml" "$ETC_DIR/compose.yaml" 0644
echo "installed the scripts in $SBIN_DIR and $ETC_DIR/compose.yaml"

if [[ ! -e $ETC_DIR/compose.env ]]; then
  env_tmp=$(mktemp)
  tmp_files+=("$env_tmp")
  cat >"$env_tmp" <<EOF
# Read by compose (deploy/leonida-log-apply.sh and leonida-log-scrape.sh). No secrets here.
LEONIDA_UID=$(id -u "$SVC_USER")
LEONIDA_GID=$(id -g "$SVC_USER")
LEONIDA_PORT=$PORT
# SCRAPERS_DISABLED=ign,keengamer
EOF
  install -o root -g root -m 0644 "$env_tmp" "$ETC_DIR/compose.env"
  echo "created $ETC_DIR/compose.env"
else
  echo "kept $ETC_DIR/compose.env"
fi

# 3. The one privileged command, validated before it is put in place. The apply script re-validates its argument.
priv_tmp=$(mktemp)
tmp_files+=("$priv_tmp")
cat >"$priv_tmp" <<EOF
Defaults!$APPLY_DEST env_reset
$SVC_USER ALL=(root) NOPASSWD: $APPLY_DEST *
EOF
visudo -cf "$priv_tmp" >/dev/null || die "visudo rejected the privilege rule"
priv_backup=""
if [[ -e $PRIV_DROPIN ]]; then
  priv_backup=$(mktemp)
  tmp_files+=("$priv_backup")
  cp -p "$PRIV_DROPIN" "$priv_backup"
fi
install -o root -g root -m 0440 "$priv_tmp" "$PRIV_DROPIN"
# A broken file in /etc/sudoers.d can lock everyone out of the privilege tool, so check the whole set too.
if ! visudo -c >/dev/null; then
  if [[ -n $priv_backup ]]; then
    cp -p "$priv_backup" "$PRIV_DROPIN"
  else
    rm -f "$PRIV_DROPIN"
  fi
  die "visudo -c rejected the full configuration; restored the previous $PRIV_DROPIN (or removed the new one)"
fi
echo "installed $PRIV_DROPIN"

# 4. The key file, created before sshd is pointed at it. sshd reads it as the target user, so root:leonida-log
# 0640 (a root-only 0600 file would silently reject the key); sshd's StrictModes still sees root as owner.
[[ -e $AK ]] || install -o root -g "$SVC_USER" -m 0640 /dev/null "$AK"
if [[ -n $key ]]; then
  if grep -qF -- "$kblob" "$AK"; then
    echo "key already authorized: $(ssh-keygen -l -f /dev/stdin <<<"$key")"
  else
    printf 'restrict,command="%s" %s\n' "$DEPLOY_DEST" "$key" >>"$AK"
    echo "authorized: $(ssh-keygen -l -f /dev/stdin <<<"$key")"
  fi
fi
chown root:"$SVC_USER" "$AK"
chmod 0640 "$AK"

# 5. The sshd drop-in, with a backup to restore if sshd -t or the root-scope check fails.
backup=""
if [[ -e $SSHD_DROPIN ]]; then
  backup=$(mktemp)
  tmp_files+=("$backup")
  cp -p "$SSHD_DROPIN" "$backup"
fi
restore_sshd() {
  if [[ -n $backup ]]; then
    cp -p "$backup" "$SSHD_DROPIN"
  else
    rm -f "$SSHD_DROPIN"
  fi
}

ssh_tmp=$(mktemp)
tmp_files+=("$ssh_tmp")
cat >"$ssh_tmp" <<EOF
# Managed by deploy/install-host.sh. Applies to the CI deploy user only.
Match User $SVC_USER
    AuthorizedKeysFile $AK
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    X11Forwarding no
    AllowTcpForwarding no
EOF
install -o root -g root -m 0644 "$ssh_tmp" "$SSHD_DROPIN"

if ! sshd -t; then
  restore_sshd
  die "sshd -t failed; the previous sshd drop-in was restored and sshd was not reloaded"
fi

root_keys=$(sshd -T -C user=root,host=localhost,addr=127.0.0.1 | grep -i '^authorizedkeysfile' || true)
if [[ -z $root_keys ]]; then
  restore_sshd
  die "could not read root's authorizedkeysfile from sshd -T; restored, sshd was not reloaded"
fi
if [[ $root_keys == *"$ETC_DIR"* ]]; then
  restore_sshd
  die "the drop-in leaks into root's settings ($root_keys); restored, sshd was not reloaded"
fi

svc_keys=$(sshd -T -C "user=$SVC_USER,host=localhost,addr=127.0.0.1" | grep -i '^authorizedkeysfile' || true)
if [[ $svc_keys != *"$AK"* ]]; then
  restore_sshd
  die "sshd does not apply the drop-in to $SVC_USER (is the Include of sshd_config.d missing?); restored, sshd was not reloaded"
fi

# Where sshd is socket-activated (Ubuntu 24.04) ssh.service may be inactive; each new connection then starts
# sshd with the new config, so there is nothing to reload. Reload only when the service is running.
systemctl try-reload-or-restart ssh
echo "sshd config in place (reloaded if ssh.service was running)"

# 6. The scrape units. An identical re-run changes nothing; a changed unit restarts a running timer.
units_changed=0
install_file "scrape service" "$SRC_DIR/leonida-log-scrape.service" "$UNIT_DIR/leonida-log-scrape.service" 0644
units_changed=$((units_changed | file_changed))
install_file "scrape timer" "$SRC_DIR/leonida-log-scrape.timer" "$UNIT_DIR/leonida-log-scrape.timer" 0644
units_changed=$((units_changed | file_changed))
systemctl daemon-reload
echo "installed the leonida-log-scrape units in $UNIT_DIR"
if ((enable_scrape)); then
  systemctl enable --now leonida-log-scrape.timer
  if ((units_changed)); then
    systemctl restart leonida-log-scrape.timer
  fi
fi
if ! systemctl cat host-alert@.service >/dev/null 2>&1; then
  echo "WARNING: host-alert@.service is not installed on this host; scrape failures will not be delivered" >&2
fi

echo
echo "summary"
echo "  scripts:       $DEPLOY_DEST, $APPLY_DEST, $SBIN_DIR/leonida-log-scrape"
echo "  compose:       $ETC_DIR/compose.yaml, $ETC_DIR/compose.env"
echo "  privilege:     $PRIV_DROPIN"
echo "  authorized:    $AK ($(grep -c . "$AK" || true) key line(s))"
echo "  sshd drop-in:  $SSHD_DROPIN"
echo "  scrape timer:  $(systemctl is-enabled leonida-log-scrape.timer 2>/dev/null || true) / $(systemctl is-active leonida-log-scrape.timer || true)"
echo "Check from another machine before closing your root session:"
echo "  a fresh root login still works;"
echo "  the CI key with a command of 0000000000000000000000000000000000000000 prints a refusal;"
echo "  the CI key with a command of id does not run id."
