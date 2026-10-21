# Fix: Share neighbor lookup and field-error text

**Type:** Fix
**Status:** verified
**Branch:** `fix/share-neighbor-lookup-and-field-error`
**Fixes:** F-01

## The problem

F-01 (P3): in `src/offseason/offseason-plan-repository.ts`, `loadForNewTeams` repeats the steps `loadSources` already does: list leagues, fail on an unreadable league, find the current league record, and resolve the league above and below. `src/components/offseason/new-teams-section.tsx` adds a third private `FieldError` beside the identical ones in `src/components/teams/team-form.tsx` and `src/components/leagues/league-form.tsx`. Copies can drift when a rule changes.

F-02 (unverified, about old plans feeding the name checks) is a lead for feature 13 and is not repaired here; it stays in the ledger.

## The fix

- In `offseason-plan-repository.ts` add one private `resolveNeighbors(db, league)` returning `Loaded<{ leagues: League[]; current: League; above: League | null; below: League | null }>` (same errors as today: read failure and "A saved league could not be read"). `loadSources` and `loadForNewTeams` both call it; their results and error kinds stay the same.
- Create `src/components/field-error.tsx` exporting `FieldError({ text })` (renders nothing without text; otherwise a small `ThemedText` with `accessibilityRole="alert"` in `Accent.danger`, exactly as today) and use it in the three forms, deleting the local copies and their now-unused `error` style entries if nothing else uses them.
- No behavior change, no new dependency, no new abstraction beyond these two shared pieces.

## Build steps

- [x] **Step 1 - Share the helper and the component** - Make the changes above. *Done when:* lint, `npx tsc --noEmit` and `npm test` pass with the same 556 tests, and reading the diff shows each copy replaced by the shared one with identical output.

## Verify

- Automated: `npm test` (556 pass), `npx tsc --noEmit`, `npm run lint`.
- Manual (user, web or tablet): submit the league form, team form and the New teams form with a missing or invalid field; each still shows its red error text under the field.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":2107,"specSha256":"d49ce12da72eedfad0f592d740f0631f4ff4e14255ae52f83fef448629e98e15","branch":"refs/heads/fix/share-neighbor-lookup-and-field-error","head":"65360d5f4c9442a1580e5b75070a97140742fd24","baseRef":"refs/heads/main","baseCommit":"65360d5f4c9442a1580e5b75070a97140742fd24","sourceTree":"d1f73a6bfde36011079982e9f60f25dc6d0a39d6","landing":"local-merge","absentOptional":[]} -->

## Findings

### share-neighbor-lookup-and-field-error/F-01 [P3] closed - Link resolution and field-error text are copied instead of shared

**File:** src/offseason/offseason-plan-repository.ts:248
**Found:** 2026-10-20 by /audit (scope: current; lens: all)
**Why it matters:** `loadForNewTeams` repeats the "list leagues, find the current record, resolve the league above and below" steps already in `loadSources`, and `new-teams-section.tsx` adds a third private `FieldError` next to the ones in `team-form.tsx` and `league-form.tsx`. Copies drift apart when a rule changes (for example how an unreadable league is handled).
**Suggested fix:** Have both repository helpers call one small `resolveNeighbors(db, league)` that returns the leagues, the current record and the two neighbors, and move `FieldError` to one shared component. Nothing current is lost.
**Resolution:** `resolveNeighbors` now serves both `loadSources` and `loadForNewTeams`; one shared `FieldError` in `src/components/field-error.tsx` replaces the copies in the league, team and new-teams forms. Re-reviewed 2026-10-21 by /audit (scope: current; lens: all): both repository helpers keep their results and error kinds, the shared `FieldError` renders the same alert text and colour, the removed `error` styles and the unused `Accent` import in the team form had no other users, and no new defect was found.
