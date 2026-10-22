# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to land while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-02 [P3] unverified - Plans from earlier seasons would feed the name checks

**File:** src/offseason/offseason-plan-repository.ts:197
**Found:** 2026-10-20 by /audit (scope: current; lens: all)
**Why it matters:** `listStagedNewTeams` reads every document in `offseason-plans`, so once feature 13 applies an offseason and a league has later seasons, old plans (and their staged team and player names) would still count as "used by a staged team". Not reachable today because a league has one season until 13.
**Suggested fix:** When feature 13 applies or archives an offseason, delete its plan, or have the name checks read only plans whose season is still in `offseason`. Confirm this in 13's spec.
**Resolution:**
