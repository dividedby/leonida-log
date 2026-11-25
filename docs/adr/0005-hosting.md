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
