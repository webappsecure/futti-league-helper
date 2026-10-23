# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to land while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-03 [P3] unverified - Applied plans accumulate and are parsed on every name check

**File:** src/offseason/offseason-plan-repository.ts:246
**Found:** 2026-10-22 by /audit (scope: full; lens: performance)
**Why it matters:** 13c keeps each applied plan as history, and `listOffseasonPlans` lists and validates every plan document (plus all seasons) each time a draft pool, pick or new team is staged. Cost grows with seasons played. Not measured; at a handful of seasons it is negligible.
**Suggested fix:** If it ever shows, read only the plans for known offseason season ids with `db.get`, instead of listing all.
**Resolution:**
