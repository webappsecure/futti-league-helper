# Fix: Offseason card refreshes after the finishing order changes

**Type:** Fix
**Status:** verified
**Branch:** `fix/offseason-card-refresh-after-order-change`
**Fixes:** F-01

## The problem

`SeasonCard` and `OffseasonCard` each call `useSeasonArchive`, which reloads only when the season status changes. Saving a corrected finishing order refreshes the Season card's copy but not the Offseason card's, so the Offseason card keeps the old position numbers and row order (and, with no saved plan, the old suggestion) until the league is reopened. Code: `src/components/leagues/league-detail.tsx:82-84`, `src/components/seasons/season-card.tsx` (`run`), `src/components/offseason/offseason-card.tsx:30-31`. A saved plan holds ids only, so saved data is not affected.

## The fix

- `SeasonCard` takes an optional `onArchiveChanged: () => void` prop and calls it after a successful write (end season or save order), next to the existing refreshes.
- `LeagueDetail` keeps a small counter (`archiveVersion`), increments it from `onArchiveChanged`, and passes it to `OffseasonCard`.
- `OffseasonCard` passes `${season.status}:${version}` as the second argument of `useSeasonArchive` (that argument is only a reload trigger), so the archive is re-read after each change.
- `PlanEditor` is keyed by the archive's team order (franchise ids joined), so it restarts from the saved plan, or from a fresh suggestion when none is saved, when the order changes. Unsaved toggles are dropped at that point, which is the intended behavior.
- Do not add a shared store, context or new dependency. No data, repository or storage change.

## Build steps

- [x] **Step 1 - Refresh the Offseason card after an order change** - Make the changes above in `season-card.tsx`, `league-detail.tsx` and `offseason-card.tsx`. *Done when:* lint, `npx tsc --noEmit` and `npm test` pass, and reading the code shows that saving a new finishing order re-reads the archive for the Offseason card and remounts the editor with the new order.

## Verify

- Automated: `npm test`, `npx tsc --noEmit`, `npm run lint` (baseline 492 tests pass).
- Manual (user, web or tablet): end a season of a relegation league, open "Edit finishing order", move a team and save; the Offseason card immediately shows the new positions and order without reopening the league. A previously saved plan keeps the same teams selected.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":2376,"specSha256":"8d6bac8ddc7149b99d967215a98e9e98167b1c2ec8072029e5e90e8211f10d99","branch":"refs/heads/fix/offseason-card-refresh-after-order-change","head":"76b8238f0bdab4eb6b52a6e6bd8ae0e08a4729c8","baseRef":"refs/heads/main","baseCommit":"76b8238f0bdab4eb6b52a6e6bd8ae0e08a4729c8","sourceTree":"9ead00ad87ebf2bb8d3fcb55e5b11fd33ec3b396","landing":"local-merge","absentOptional":[]} -->

## Findings

### offseason-card-refresh-after-order-change/F-01 [P3] closed - Offseason card keeps old positions after the finishing order is corrected

**File:** src/components/offseason/offseason-card.tsx:34
**Found:** 2026-10-20 by /audit (scope: current; lens: all)
**Why it matters:** The card and the Season card each call `useSeasonArchive`, which reloads only when the season status changes. Saving a corrected finishing order refreshes the Season card's copy but not the Offseason card's, so the position numbers, row order and suggestion in the Offseason card stay as they were until the league is reopened.
**Suggested fix:** Have `SeasonCard` take an `onOrderChanged` callback (or share one archive hook result) so `OffseasonCard` calls `archive.refresh()`; or key `OffseasonCard` on a value that changes when the order is saved. A saved plan is unaffected because it stores ids only.
**Resolution:** Season card now calls `onArchiveChanged` after a successful write; `LeagueDetail` bumps a counter passed to `OffseasonCard` as `archiveVersion`, which reloads the archive, and the plan editor is keyed by team order so it restarts from the saved plan or a new suggestion. Re-reviewed 2026-10-20 by /audit (scope: current; lens: all): the Offseason card's archive is re-read after each successful Season card write, the editor remounts on a changed order, a saved plan (ids only) is unaffected, and no new defect was found in the repaired files.
