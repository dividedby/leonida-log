# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the canonical domain glossary (Point of no return, Current mission, Item, Locked item, Curated, Candidate, …).
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

This is a **single-context** repo: one root `CONTEXT.md`.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-phone-first-pwa.md
│   └── 0002-spoiler-gating-by-current-mission.md
└── app/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids (e.g. "Point of no return" or "gate", not "checkpoint"; "Candidate", not "scraped item").

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (spoiler gating by current mission) — but worth reopening because…_
