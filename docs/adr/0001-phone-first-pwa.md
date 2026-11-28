# 1. Phone-first PWA in Next.js

Date: 2026-11-25
Status: Accepted

## Context

Leonida Log is used mainly on a phone while playing: tick an item, set a stat, check what's next. It's a single-user guide, and the fleet's web apps are Next.js + TypeScript.

## Decision

Build a web app with Next.js (App Router) and TypeScript, server components by default and server actions for writes. Ship a PWA manifest and icons so it installs to the home screen. No native app. Design for a ~375px viewport first; desktop is a stretched phone layout.

## Consequences

- One codebase, no app-store review, deploys through CD.
- No offline mode in v1: the app needs the server for progress writes.
- Push notifications would need web push later; v1 has none (ADR 0006).
