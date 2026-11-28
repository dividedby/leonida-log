# 9. Stats are set by hand, no workout log

Date: 2026-11-27
Status: Accepted (supersedes [0006](0006-stat-decay-manual-log.md))

## Context

ADR 0006 planned a manual workout log per character and stat, with "Last workout: N days ago" and a "Log a workout" button. The owner tried the idea against real play and finds a log bogs things down: it asks for a tap after every workout, and the decay rules it would serve are still unknown.

## Decision

- Stats are levels (0 to 4) the user sets by hand: tap a StatRing on `/stats`, pick the level. Nothing records or shows workouts, and no relative-time code exists.
- The Stats screen keeps the tip that Strength and Cardio can slip while Focus levels stay.
- No decay estimate, no overdue hint, no reminders (unchanged from 0006).
- The `workouts` table and the repository's `logWorkout` and `lastWorkout` stay as they are. Dropping them is a later change, as its own contract migration (migrations must stay readable by the previous release). Done in 0002; see Update.

## Consequences

- Nothing guesses at rules we don't know, and the play-session flow has no logging step.
- Revisit once decay rules are documented. A log or an overdue hint would come back as a new decision.
- The unused table and methods are dead weight until that contract migration. (Removed; see Update.)

## Update (2026-11-27)

Migration `0002_drop_workouts` dropped the `workouts` table, and `logWorkout` and `lastWorkout` are gone. Release 0.1.0 never touched the table, so a rollback to it still runs.
