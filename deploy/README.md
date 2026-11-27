# Hosting Leonida Log

Operator runbook for the VPS behind gta.dvdby.cc (ADR 0005). The app runs as a docker compose project on one Linux host, listens on `127.0.0.1` only, and is reached through a Cloudflare Tunnel behind Cloudflare Access (Google SSO). Nothing here changes how `pnpm dev` works on a laptop. In this file `<host>` is the machine's name or address and `owner@example.com` the one allowed email; the real values live in the secrets and in Cloudflare, not in this public repo.

How the pieces fit:

- **CI builds, the host only pulls.** `.github/workflows/deploy-vps.yml` builds `ghcr.io/dividedby/leonida-log:<sha>` on a native arm64 runner (the host is aarch64), smoke-tests it, pushes it, then tells the host to deploy that SHA. The package is public, so the host pulls without a token.
- **One image, three commands** (`Dockerfile`): the app, `node scripts/migrate.mjs` and the scraper CLI. The runtime is the production dependencies plus `.next` and the sources the scripts read, not Next's standalone output.
- **A root-installed `compose.yaml`.** The host runs `/etc/leonida-log/compose.yaml`, a copy the owner installs. A merge to `main` therefore cannot change what the container may mount or run as; per deploy only the image tag changes. Read-only root, no capabilities, `no-new-privileges`, a 256-process limit, a 384 MB cap, data at `/var/lib/leonida-log` mounted as `/data`.
- **Docker access is root access**, so the CI key never gets it. It can run one command, `leonida-log-deploy`, as the unprivileged `leonida-log` user, which may run exactly one thing as root: `leonida-log-apply <sha>`. The sudoers rule sets `env_reset`, so nothing the CI key sends changes `apply`'s settings.
- **The service user's home is `/var/lib/leonida-log-deploy`, root-owned and not writable by it, never the clone.** Under a forced command bash can read `~/.bashrc` and git reads `~/.gitconfig`; with the home inside the clone, a file committed to `main` would run as `leonida-log` on every deploy. The installer sets the home (also with `usermod -d` on an existing user), and `leonida-log-deploy` additionally pins `HOME`, `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_NOSYSTEM=1` before any git call.
- **Loopback only.** The app is published on `127.0.0.1:5100`. Nothing is opened on the host firewall. Any local account on the host can reach that port without logging in, so keep accounts on the host to people who may see the data.

The privileged host files (everything in this folder except the tests and `image-smoke.sh`, plus `compose.yaml`) are installed by the owner by hand, not by CI. CLAUDE.md says deploys go through CD; app releases do, but a file that runs as root is only updated after the owner has read it.

## Files

| File                                       | Installed as                         | Runs as                              |
| ------------------------------------------ | ------------------------------------ | ------------------------------------ |
| `leonida-log-deploy.sh`                    | `/usr/local/sbin/leonida-log-deploy` | `leonida-log` (forced command)       |
| `leonida-log-apply.sh`                     | `/usr/local/sbin/leonida-log-apply`  | root, through one sudoers rule       |
| `leonida-log-scrape.sh`                    | `/usr/local/sbin/leonida-log-scrape` | root, from the scrape and feed units |
| `leonida-log-scrape.service`, `.timer`     | `/etc/systemd/system/`               | root (systemd)                       |
| `leonida-log-feed.service`, `.timer`       | `/etc/systemd/system/`               | root (systemd)                       |
| `../compose.yaml`                          | `/etc/leonida-log/compose.yaml`      | read by docker compose as root       |
| `install-host.sh`                          | not installed: run once from `/root` | root, by the owner                   |
| `image-smoke.sh`, `deploy-scripts.test.ts` | not installed: CI and `pnpm test`    |                                      |

Settings in `/etc/leonida-log/compose.env` (root-owned, no secrets, created once by `install-host.sh`, never overwritten): `LEONIDA_UID`, `LEONIDA_GID` (the service user's ids), `LEONIDA_PORT` (default 5100) and optionally `SCRAPERS_DISABLED`.

## Prerequisites

- Linux with systemd, Docker Engine and the compose plugin, `sqlite3`, `flock`, `curl` and `git`. `install-host.sh` installs none of them and stops if one is missing. Check the compose plugin and that Docker starts at boot before the first install.
- A free port 5100 (`ss -ltn`), enough memory next to the other services (the app is capped at 384 MB, a scrape run at 256 MB) and disk for the images.
- The infra repo's `host-alert@.service` template, so scrape failures reach Discord. The installer warns when it is missing.
- A Cloudflare tunnel and Access app for gta.dvdby.cc (below).

## Automatic deploys

`deploy-vps.yml` ("deploy") runs on every push to `main` and on a manual dispatch from `main`. It skips pushes that only touch docs, Markdown, `.claude/`, CI-only workflows, Dependabot config, issue templates, tests and their fixtures, or the vitest, eslint and prettier configs. A change to curated data, scrapers, `drizzle/`, `deploy/`, the Dockerfile, `compose.yaml` or the workflow does deploy.

On the host the CI key can run `/usr/local/sbin/leonida-log-deploy` and nothing else. It:

1. accepts only a 40-character lowercase hex SHA that is an ancestor of `origin/main` (anything else, including a shell command, is refused), takes a lock, fetches `main` and checks the commit out detached (a reference copy; the clone is never built);
2. calls `sudo -n leonida-log-apply <sha>`, which re-validates the SHA, then:
   1. `docker compose pull app`: a failure changes nothing;
   2. snapshots the database with `VACUUM INTO /var/lib/leonida-log/pre-deploy/<sha>.db` as the service user, keeping the newest three: a failure changes nothing;
   3. `docker compose run --rm migrate`: a failure leaves the old app running;
   4. `docker compose up -d app`, then polls `/api/health` for up to 60 s for `"revision":"<sha>"`;
   5. on failure, starts the previous release again (the SHA in `/var/lib/leonida-log-deploy/current`), polls, and exits 1: the job goes red, with "rolled back, healthy" or "ROLLBACK ALSO UNHEALTHY" in its log. On a first deploy with no previous release the failed app is stopped;
   6. on success, records the SHA, prints `done: running <sha>`, removes the other images of this repo, and warns if an installed script, `compose.yaml` or unit differs from the clone's copy at that SHA.

Replaying an older `main` SHA by hand acts as a rollback (its image must still exist in GHCR). The log is in the Actions run; the app's is `docker logs leonida-log-app-1`.

### Migrations must stay readable by the previous image

Rolling back swaps the image, not the database. A migration therefore has to work for both the new and the previous release: expand first (add a nullable column, a new table, an index), ship code that uses it, and only in a later deploy contract (drop or rename, tighten constraints). A release that cannot be rolled back over its own migration leaves a broken app on a failed health check. The pre-deploy snapshot is the manual way back: stop the app, copy the snapshot over `/var/lib/leonida-log/leonida.db` (delete `leonida.db-wal` and `-shm` first), start the app.

## One-time setup (by the owner)

The root scripts are run by the owner by hand: agent sessions cannot run privileged commands on the host (a guard hook blocks them), so no agent runs `install-host.sh`.

1. On your computer, make a key with no passphrase: `ssh-keygen -t ed25519 -N '' -C leonida-log-ci -f <path>`.
2. Merge the pull request that adds this folder. Its push runs `image` successfully and `deploy` fails at the secrets check until step 6 is done; re-run it then. After the first push, set the `leonida-log` package public (GitHub, Packages, Package settings) so the host can pull without a token.
3. In your own checkout of the merged `main`, read `deploy/install-host.sh`, the three `deploy/leonida-log-*.sh` scripts, the four scrape and feed units and `compose.yaml`, then copy them to the host: `scp deploy/install-host.sh deploy/leonida-log-deploy.sh deploy/leonida-log-apply.sh deploy/leonida-log-scrape.sh deploy/leonida-log-scrape.service deploy/leonida-log-scrape.timer deploy/leonida-log-feed.service deploy/leonida-log-feed.timer compose.yaml root@<host>:/root/`.
4. Keep a second root SSH session open. As root: `bash /root/install-host.sh '<the .pub line>'`. It creates the `leonida-log` user (not in the docker group; it stops if it is), the folders and the clone of the public repo (HTTPS, no deploy key), installs the files, the sudoers rule (checked with `visudo`), the restricted key and an sshd drop-in for that user only. It runs `sshd -t` and checks root's authorized-keys setting does not point at the new file before reloading sshd, and restores the previous drop-in if either fails. It prints the sha256 of each file it installs; compare them with `shasum -a 256` on your computer.
5. From your computer, check: `ssh -i <path> -o IdentitiesOnly=yes leonida-log@<host> 0000000000000000000000000000000000000000` prints a refusal; the same with `id` as the command does not run `id`; a fresh root login still works.
6. Create the GitHub environment `production` (deployment branches: `main` only, no required reviewers) and add these environment secrets: `VPS_SSH_KEY` (the private key file's contents), `VPS_USER` (`leonida-log`), `VPS_HOST` (the host's name or address), `VPS_SSH_KNOWN_HOSTS` (the output of `ssh-keyscan <host>`, with the fingerprint cross-checked on the host).
7. Run the "deploy" workflow by hand; it should end with `done: running <sha>`. On the host `curl -s http://127.0.0.1:5100/api/health` returns `{"ok":true,"revision":"<sha>"}` and `ss -ltn` shows the port on `127.0.0.1` only.

After a change to any installed file, review it in your own checkout, copy the changed files to `/root/` again and run `bash /root/install-host.sh` with no argument. Never run it from `/srv/leonida-log`: the `leonida-log` user can rewrite that clone, and `install-host.sh` refuses files not owned by root.

## Cloudflare

Done with the owner's `onboard-app.sh` (the tunnel, its connector service, the ingress rule, the Access app and the DNS record), then by joining the name to the shared header and rate-limit rules:

- Tunnel `leonida-log-prod` pointing at `http://localhost:5100`; Access app of the same name: Google only, one Allow policy for `owner@example.com`. Leave the ingress `httpHostHeader` unset.
- Add `gta.dvdby.cc` to the shared "dockyard security headers" rule (four headers) and to the rate-limit rule's host list.
- From outside, signed out, `/` and `/api/health` must answer 302 to Access, the four headers must be present and HTTP must redirect to HTTPS. Only then sign in on the phone.

The app has no login of its own in v1 (ADR 0005). Verifying the Access token in the app, as the marketplace app does, and an alerting health timer are follow-ups.

## Scraper timer

`leonida-log-scrape.timer` starts `leonida-log-scrape.service` every Monday at 06:15 America/Chicago (up to 10 minutes of random delay; `Persistent=true` runs a missed one at the next boot). The unit runs `leonida-log-scrape`, which starts `docker compose run --rm scraper` from the deployed image (the SHA in `current`), with the same data mount and a 256 MB cap. The report goes to `/var/lib/leonida-log/reports/latest.md` and `changed-since-<date>.md`. Exit 0 is a clean run; any other status (2 means a source's listing could not be read) fails the unit, and `OnFailure=host-alert@attention:%n.service` sends one alert to Discord #attention.

The timer is not enabled by the installer unless you pass `--enable-scrape`. First run it once by hand and read the result, then enable it:

```bash
systemctl start leonida-log-scrape.service          # blocks until the run ends
journalctl -u leonida-log-scrape -n 50
less /var/lib/leonida-log/reports/latest.md
bash /root/install-host.sh --enable-scrape
systemctl list-timers leonida-log-scrape.timer
```

The scraper's unauthenticated GitHub budget (60 requests an hour) is per IP and shared with everything else on the host.

## KeenGamer feed timer

KeenGamer's article pages sit behind a Cloudflare challenge that the scrapers never try to pass, but `https://www.keengamer.com/feed/` is open and holds the full text of its newest 20 items, about 9 hours' worth (ADR 0007, 2026-11-27 note). `leonida-log-feed.timer` therefore starts `leonida-log-feed.service` every 4 hours (00:40, 04:40, ... America/Chicago, up to 15 minutes of random delay; `Persistent=true`). The unit runs `leonida-log-scrape --feed-only`: the same script and image as the weekly scrape, so the same data mount and 256 MB cap, but one request, no sitemaps and no report. New or changed items tagged "Grand Theft Auto VI" become candidates, and the Monday run's report includes them.

- **Lock.** The script takes the deploy lock for the container's life, which is well under a minute. A deploy that starts meanwhile waits for it, far inside its own 10 minutes. A poll that starts during a deploy or the weekly scrape waits at most 60 seconds for the lock, then exits 75 without polling (it gives way; the next poll picks the items up). The unit has `SuccessExitStatus=75`, so that is not a failed unit. The timer's 04:40 and 08:40 slots straddle the Monday scrape (06:15, 45 minutes at most), so a poll overlapping it should not happen.
- **Bounded run.** The scraper ends a feed poll by itself: `--feed-only` sets a hard 180 s deadline that aborts every request and wait (robots.txt, retries, `Retry-After` and `Crawl-delay` included) and exits 2, and a retry budget of 2. `TimeoutStartSec=7min` (420 s) is a backstop above the worst case, 60 s lock wait + 60 s container start + 180 s deadline = 300 s, so systemd never kills a poll that holds the lock.
- **No alert.** The unit has no `OnFailure=`: a failed poll is routine (a 5xx, a timeout) and would page up to six times a day. A feed that stays unreadable also fails the weekly scrape's KeenGamer listing, which exits 2 and alerts. Check polls with `systemctl list-timers leonida-log-feed.timer`, `systemctl status leonida-log-feed.service` and `journalctl -u leonida-log-feed`.
- **Gaps.** A feed that grows past 20 items in under 4 hours (a news burst) drops the oldest items before the next poll; they are not recovered.
- **Install.** `install-host.sh` installs and enables the timer in the same run as everything else (it needs an image that has `--feed-only`, so run it after the deploy that ships it). To check it: `systemctl start leonida-log-feed.service`, then `journalctl -u leonida-log-feed -n 20`.

## Backups

The database is one SQLite file at `/var/lib/leonida-log/leonida.db` (WAL mode), so back it up with `VACUUM INTO` or `sqlite3 .backup`, never a plain copy. The host's backup job is defined in the infra repo, not here. The pre-deploy snapshots in `/var/lib/leonida-log/pre-deploy/` are for rollbacks, not backups.

## Manual fallback

If the deploy job is down, run the deploy script by hand as the service user (it keeps the lock, the snapshot, the health check and the rollback; give it the full SHA of a commit on `main` whose image is in GHCR):

```bash
sudo -u leonida-log /usr/local/sbin/leonida-log-deploy <sha>
```

## Logs and failure modes

- `docker logs leonida-log-app-1` is the app's log; `docker inspect --format '{{.State.Health.Status}}' leonida-log-app-1` its health. The container restarts itself unless stopped.
- A deploy that fails at `pull` usually means the package is not public yet or the SHA's image was never pushed (the `image` job failed or was skipped).
- A deploy that fails at `migrate` leaves the old app up; the error is in the job log.
- `apply` waits up to 10 minutes for the lock, so a second deploy queues behind the first; the weekly scrape takes the same lock for its whole run (up to 45 minutes), so a deploy that starts during a scrape fails after 10 minutes with "another apply holds the lock": re-run it when the scrape ends. The 4-hourly feed poll holds it for under a minute.
- `journalctl -u leonida-log-scrape` shows scraper runs, `journalctl -u leonida-log-feed` the feed polls.
