# 6. Stat decay: manual workout log, no notifications in v1

Date: 2026-11-25
Status: Superseded by [0009](0009-stats-set-by-hand.md)

## Context

Strength and Cardio can slip if workouts are skipped; Focus levels stay. The exact decay rules are unknown and hard to track from outside the game.

## Decision

v1 keeps a manual workout log per character and stat and shows "Last workout: N days ago". The user sets stat levels by hand. No decay estimate, no overdue hint, no reminders.

## Consequences

- Nothing guesses at rules we don't know.
- Revisit once decay rules are documented: an overdue hint first, notifications after.
