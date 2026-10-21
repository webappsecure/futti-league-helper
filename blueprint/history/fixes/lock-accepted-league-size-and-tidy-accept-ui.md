# Fix: Lock accepted league size and tidy accept UI

**Type:** Fix
**Status:** verified
**Branch:** `fix/lock-accepted-league-size-and-tidy-accept-ui`
**Fixes:** F-03, F-04

## The problem

- **F-03 (P2):** `updateLeague` in `src/leagues/league-repository.ts` ignores the league's season. An accepted league can be edited to a larger size, leaving "8 of 10 teams" with no way to add teams (Add team is hidden once accepted). Changing naming style on an accepted league has the same problem: existing team identities were entered under the old style.
- **F-04 (P3):** In `src/components/teams/team-list.tsx` the `!accepted && (<> ... </>)` block around Edit and Delete is mis-indented. The rules for which controls are enabled after accept and the text mapping `acceptErrorText` (`src/components/rosters/league-review.tsx`) and `playerLine` (`src/components/rosters/roster-view.tsx`) have no tests.

## The fix

- **Product call made here, change it at review if wrong:** on an accepted league, `size` and `namingStyle` are locked. Name, relegation on/off and promoted/demoted counts stay editable (offseason rules may still need adjusting). Delete and links are unchanged.
- `updateLeague` calls `getLeagueSeason(db, id)` after the not-found check. A storage failure returns `storage` (never "unlocked"). When a season exists and `size` or `namingStyle` differs from the stored league, return `validation` with field errors on `size` and/or `namingStyle`, reusing `LOCKED_TEXT`-style wording ("Size is locked once the league is accepted." / "Team names style is locked once the league is accepted."). Nothing is written. Unchanged values pass.
- `league-form.tsx` already renders `errors.size` and `errors.namingStyle`; no UI wiring beyond that.
- F-04: re-indent the Edit/Delete block. Move the control-enabled rules (`accepted`, `seasonKnown`, `full`, `rostersReady`, `missingRosters`, rosters count, team count) into a pure `teamControls(...)` in `src/components/teams/team-controls.ts` returning booleans for add, generate, rerollAll, review, edit/delete shown. `team-list.tsx` uses it. Add tests for `teamControls`, `acceptErrorText` and `playerLine`. No behavior change to the controls.
- Must not break: existing league, franchise, roster and season tests; unlinked and linked league edit rules (`linkedEditProblems`).

## Build steps

- [x] **1. Lock size and naming style on accepted leagues.** Edit `updateLeague` and add tests in `src/leagues/league-repository.test.ts`. *Done when:* tests show an accepted league rejecting a size change and a naming style change with the field errors and no write, accepting a name or relegation count change, an unaccepted league editing as before, and a season-lookup failure returning `storage`; `npm test`, `npx tsc --noEmit`, `npm run lint` green.
- [x] **2. Tidy the teams section and test its rules.** Add `team-controls.ts` and its test, use it in `team-list.tsx`, fix the indentation, and add small tests for `acceptErrorText` and `playerLine`. *Done when:* the new tests pass, behavior in the teams section is unchanged (same buttons enabled in the same states), and `npm test`, `tsc`, `lint` are green. Note any manual check not run.

## Verify

- Unit tests as above. Manual (if run): accept a league, open Edit, change size or naming style and save: field errors appear and nothing changes; change the name: saves. Report only what was observed.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":3405,"specSha256":"f5cdf9eaf1fd29709d3586865e99815a2f2bc39755dae2ea7c063bc71a662bda","branch":"refs/heads/fix/lock-accepted-league-size-and-tidy-accept-ui","head":"9599a10900ad88c9a41898c2f6d1f3a2c9d9cc6c","baseRef":"refs/heads/main","baseCommit":"9599a10900ad88c9a41898c2f6d1f3a2c9d9cc6c","sourceTree":"9e39fd4c0dedd897c0dacc684161826fd6b4e364","landing":"local-merge","absentOptional":[]} -->
