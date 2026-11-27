# 5. Hosting: compose on the VPS behind Cloudflare

Date: 2026-11-25
Status: Accepted

## Context

The app holds personal progress and should not be public. The fleet runs services on the Hetzner VPS behind Cloudflare.

## Decision

Deploy with docker compose on the Hetzner VPS from this repo's own `compose.yaml` and a GitHub Actions deploy workflow (modeled on moodreader's `deploy-vps.yml`), not as a dockyard unit. Expose it through a Cloudflare Tunnel at gta.dvdby.cc with Cloudflare Access (Google SSO); origin ports stay closed. Trunk-based branching: `main` is prod, no staging environment.

## Consequences

- The deploy workflow re-gates on CI and skips non-runtime changes with `paths-ignore`, keeping `workflow_dispatch`.
- Access sits in front of everything, so the app itself has no login in v1.
- A staging environment, if one is ever added, brings the two-branch flow with it.

## Deploy shape (2026-11-27)

How the decision above is built. Details and the runbook are in `deploy/README.md`.

- **Image built in CI, host only pulls.** GitHub Actions builds `ghcr.io/dividedby/leonida-log:<sha>` on a native arm64 runner (the VPS is aarch64 with 2 vCPU and 3.8 GB shared with other services, so it builds nothing), smoke-tests it and pushes it. The package is public. There is no `latest` tag.
- **One image, three commands**: the app, `scripts/migrate.mjs` and the scraper CLI (`node_modules/tsx/dist/cli.mjs scrapers/cli.ts`). The runtime is the production dependencies plus `.next` and the sources those scripts read, not Next's standalone output (which would leave out the migrator and the scraper). This replaces "standalone output" in docs/plans/v1.md step 7.
- **SSH deploy with a forced command**, as on marketplace: one CI key, one command, whose only input is a 40-hex SHA that must be an ancestor of `origin/main`. A `verify` job re-gates typecheck, lint and tests on `main` before the image is built.
- **Docker is root, so the service user is not in the docker group.** `leonida-log-deploy` runs as the unprivileged `leonida-log` user (validate, lock, fetch, ancestry check) and then calls `leonida-log-apply <sha>` through `sudo -n`, the only command the sudoers rule allows.
- **A root-installed `compose.yaml`** at `/etc/leonida-log/compose.yaml` is what runs; only the image tag changes per deploy. A merge to `main` therefore cannot mount `/` or change the user the container runs as. `apply` warns when the installed copy lags the repo's.
- **Data** is a bind mount, `/var/lib/leonida-log` as `/data`, with `DATABASE_PATH=/data/leonida.db`. The container runs as the host `leonida-log` uid and gid, so ADR 0004's backups read plain host paths. The app is published on `127.0.0.1:5100` only.
- **Releases**: `apply` pulls, snapshots the database (`VACUUM INTO`, newest 3 kept), runs `migrate`, starts the app and waits for `/api/health` to report the SHA, and starts the previous image again if it does not. The database is not rolled back, so a migration must stay readable by the previous image: expand, then contract.
- **Scraper**: a weekly host systemd timer runs `docker compose run --rm scraper`; failure alerts through `OnFailure=host-alert@attention:`.
- **Cloudflare**: its own tunnel and Access app (`leonida-log-prod`), joined to the shared security-headers and rate-limit rules. No app secrets in v1.
- **Not in v1**: verifying the Access token in the app and an alerting health timer.

CLAUDE.md says deploys go through CD. App releases do. The privileged host files (the three scripts, the units, `compose.yaml`, the installer) are installed by the owner by hand, after reading them, as on marketplace: CI never gets a way to change what runs as root.
