# Fix: Disable team edit and delete until season is known

**Type:** Fix
**Status:** verified
**Branch:** `fix/disable-team-edit-and-delete-until-season-known`
**Fixes:** F-05

## The problem

In `src/components/teams/team-list.tsx`, the per-team Edit and Delete buttons render whenever `controls.showActions` is true, and `showActions` is just `!accepted` (`src/components/teams/team-controls.ts`). `accepted` stays false while the season lookup is loading or has failed, so on an accepted league the buttons are clickable until the lookup succeeds. Add team, Generate, Reroll and Review already wait for `seasonKnown`; Edit and Delete do not, which the feature 7 spec said they should. The repositories still refuse with `locked` (or `storage` on a failed lookup), so no data can change; the user just gets a late error.

## The fix

- `teamControls` returns a new `editDeleteEnabled: boolean` equal to `seasonKnown && !accepted`.
- `team-list.tsx` keeps rendering Edit and Delete only when `controls.showActions`, and sets `disabled={!controls.editDeleteEnabled}` on both buttons.
- Add `team-controls.test.ts` cases: enabled for a known, unaccepted league; disabled while the season is unknown; disabled (and hidden via `showActions`) once accepted.
- Must not break: the existing `teamControls` expectations (the first test's full `toEqual` gains the new key), the Roster button (still available when accepted), and repository locking.

## Build steps

- [x] **1. Gate Edit and Delete on a known season.** Add `editDeleteEnabled`, wire the two buttons, update and extend tests. *Done when:* the new cases pass, the existing suite passes, and `npm test`, `npx tsc --noEmit`, `npm run lint` are green.

## Verify

- Unit tests as above. Manual (optional): open an accepted league and reload; Edit and Delete should never be clickable, and on an unaccepted league they enable once the season lookup finishes. Report only what was observed.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":1942,"specSha256":"92f37533f089c0fa27524094a02ff6da06ce9d1493ca2705490cbf496016f555","branch":"refs/heads/fix/disable-team-edit-and-delete-until-season-known","head":"a72ccd2ebe106c0729d98ec47fcec52b350bef87","baseRef":"refs/heads/main","baseCommit":"a72ccd2ebe106c0729d98ec47fcec52b350bef87","sourceTree":"3336782e571b81883b97da48a2641f1a46f4a7a8","landing":"local-merge","absentOptional":[]} -->

## Findings

### disable-team-edit-and-delete-until-season-known/F-03 [P2] closed - An accepted league's size can still be changed

**File:** src/leagues/league-repository.ts:73
**Found:** 2026-10-14 by /audit (scope: full; lens: quality, security, performance, tests)
**Why it matters:** `updateLeague` only rejects a size below the team count and never looks at the league's season. Edit stays visible on an accepted league, so an accepted 8-team league can be raised to 10. Teams cannot be added after accept, so it then shows "8 of 10 teams" with no way to fill it, and the accepted season no longer matches the league definition. Feature 7's spec left league settings as they were, so this is a gap and not a regression. Naming style and relegation counts on an accepted league have the same exposure.
**Suggested fix:** In `updateLeague`, look up `getLeagueSeason` and, when the league is accepted, refuse changes to `size` (and decide whether `namingStyle`, relegation and counts are also frozen). Show the reason in the league form. Needs a product call on which fields lock.
**Resolution:** Repaired on fix/lock-accepted-league-size-and-tidy-accept-ui: `updateLeague` refuses `size` and `namingStyle` changes once the league has a season (tests in league-repository.test.ts).
  Closed by /audit 2026-10-14 (scope: full): re-read `updateLeague`; size and naming style changes on a league with a season return field errors and write nothing, a failed lookup returns a storage error, and the five new tests plus the full suite (347) pass. No new defect found in the repair.

### disable-team-edit-and-delete-until-season-known/F-04 [P3] closed - Mis-indented fragment and no tests for the accept UI gating

**File:** src/components/teams/team-list.tsx:249
**Found:** 2026-10-14 by /audit (scope: full; lens: quality, tests)
**Why it matters:** The `!accepted && (<> ... </>)` wrapper around Edit and Delete leaves the inner buttons at the outer indentation, which hides the structure of a 300-line component. Separately, `acceptErrorText`, `playerLine` and the accepted/season-unknown gating of controls live in components and have no tests, so a regression in what is shown or enabled after accept would only be caught by hand.
**Suggested fix:** Re-indent that block, and move the control-enabled rules (`accepted`, `seasonKnown`, `full`) and the error-text mapping into small pure functions with unit tests.
**Resolution:** Repaired on the same branch: Edit/Delete block re-indented; control rules moved to `teamControls` with tests; `playerLine` and `acceptErrorText` moved to pure modules with tests.
  Closed by /audit 2026-10-14 (scope: full): the Edit/Delete block is re-indented, `teamControls`, `playerLine` and `acceptErrorText` are pure and tested, and behavior of the enabled rules matches the earlier inline conditions. No new defect found in the repair.

### disable-team-edit-and-delete-until-season-known/F-05 [P3] closed - Team Edit and Delete stay visible while the season lookup is loading or failed

**File:** src/components/teams/team-controls.ts:35
**Found:** 2026-10-14 by /audit (scope: full; lens: quality, security, performance, tests)
**Why it matters:** `showActions` is `!accepted`, and `accepted` is false until the season lookup succeeds. While it is loading, or after it failed (the retry card is showing), per-team Edit and Delete and the league-level section still render, although Add team, Generate, Reroll and Review are disabled. Feature 7's spec said locking controls stay disabled until known. The repositories still refuse (`locked`, or `storage` when the lookup fails), so no data can change; the user only gets a late error after opening the form or confirming a delete.
**Suggested fix:** Return `showActions: !accepted && seasonKnown` or add an `editDeleteEnabled` flag and disable those two buttons when the season is not known; add a test case to `team-controls.test.ts`.
**Resolution:** Repaired on fix/disable-team-edit-and-delete-until-season-known: `teamControls` returns `editDeleteEnabled` (season known and not accepted) and the per-team Edit and Delete buttons are disabled otherwise; tests added.
  Closed by /audit 2026-10-14 (scope: current): re-read the diff against main; Edit and Delete are disabled unless the season is known and the league is not accepted, still hidden once accepted, the Roster button and repository locks are untouched, and the 348-test suite passes. No new defect found in the repair.
