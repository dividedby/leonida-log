# 8. Best evidence, never labelled

Date: 2026-11-26
Status: Accepted. Supersedes the "needs research" part of ADR 0003 and the Research chip in docs/design.md and docs/branding.md.

## Context

Until now an entry needed two independent sources, one explicit non-AI source, or first-hand video. Entries that fell short were left out, or kept with `verified: false` and shown with a "Research" chip. Seven research rounds later, many cutoffs and windows still have split or thin evidence. Leaving them out hides content the player can still lose. A chip doesn't help either: it can't tell the player what to do. The `unknown` value for `closes_at` was already ruled out.

## Decision

- Every entry ships with the current best-evidence value. The app never shows a confidence label, chip or "unconfirmed" wording.
- When evidence is split or thin, pick the value that can't hurt the player. Cutoffs (`closes_at`, `lost_at_mission`) take the earliest plausible mission. Visibility (`visible_after_mission`) takes the latest plausible mission. A wrong "do this soon" costs the player little. A wrong "you have time" loses them content.
- Strangers and Freaks: the PowerPyx Strangers and Freaks index says that, unless marked missable, a strand is still available after the story. That rule alone is enough for `closes_at: never` on unmarked strands.
- Timer missions may take a structural outer bound as `closes_at`: the latest main mission the timer cannot outlast, even when the exact expiry is unknown (the Ring the Bell! precedent).
- `closes_at: unknown` stays banned. Best evidence replaces it.
- Confidence lives in the data as background only: `verified` (kept) and an optional `evidence` on items and missions:

  ```yaml
  evidence:
    basis: safe-bound # two-sources | explicit-source | first-hand | best-guess | safe-bound
    note: Two guides give a later close; the earliest is kept. # optional
  ```

  `two-sources`, `explicit-source` and `first-hand` are the old proof rules. `best-guess` is the strongest single reading of thin evidence. `safe-bound` is a value chosen by the tie-break or a structural outer bound. `parseCurated` drops `verified` and `evidence`, so app code can't render them.

- Research re-runs weekly and updates values and `evidence` as sources firm up.

## Consequences

- Entries that were held back for lack of proof can be added, so the data-build session can apply round 6 and 7 data under these rules.
- Some values will be wrong in the safe direction: a few items close earlier than they really do, or show later than they could. Weekly research narrows them.
- The Research chip and the orange "needs research" meaning are gone. Orange stays the sun disc colour.
- Candidates (ADR 0003) are still never rendered raw. A candidate shows only after review promotes it to curated, now without a flag.
