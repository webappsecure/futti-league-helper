# Feature: Offseason: approval and next season

**From build-plan:** feature 13c
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/offseason-approval-and-next-season`

## Goal

Add a final **Approval** step to the offseason wizard. Approving applies everything staged in the offseason plans (aging, progression, free agency and rookie picks, arrivals, new teams, departures), burns the new names, closes the finished season and creates the next one as `active`. This is the point where live data finally changes: until now teams, rosters and the name registry were untouched.

It also opens the offseason to leagues without promotion and relegation (a season with nobody leaving, still with aging, drafts and progression), and makes the app work across several seasons per league.

This is the last of three pieces split from feature 13 (13a, 13b done).

## Decisions (defaults to confirm in review)

- **D1. Approval covers the whole linked chain at once.** Approving from any league applies the offseason for that league and every league linked to it, in one atomic write. Reason: teams move between linked leagues, so approving one league alone would leave the other league's teams half moved. It needs every league in the chain to be in `offseason` with every wizard step complete (the arrivals step already cannot complete otherwise). An unlinked league is a chain of one.
- **D2. Teams that leave with no linked league on that side become unassigned.** The franchise and its roster document stay, with `leagueId` removed from both; the roster is kept exactly as it was at season end (no aging, no progression). Build plan item 11d fills vacancies from this pool later. A departing team that does arrive in a linked league is moved there instead (its franchise and roster get the new `leagueId` and the staged arrival roster).
- **D3. Aging at approval.** Every player on a participating team (staying teams and arrivals) after retirement and release, including free agency picks, gets age + `AGING_YEARS` (1). Rookie draft picks, progression replacements and players on newly created teams do not age (they were generated at their starting age). Progression `after` ratings are applied before aging is added (the staged `after` keeps the old age).
- **D4. The applied plan stays as history; undrafted players are discarded.** The plan document is kept (feature 14 can read retirees from it and the season archive), with `draftPool` cut down to the players who were picked. This also settles finding F-02: name checks only read plans of seasons that are still in `offseason`, so old plans never block a name.
- **D5. Names burned.** Every player name on every new roster is burned (burning is idempotent). Unpicked draftees and rerolled names are not burned.
- **D6. New teams** become franchises with `initialGrade` = the staged grade and one identity with `fromSeason` = the next season's index.
- **D7. Approval cannot be undone.** The button asks for a second tap to confirm and says so.
- **D8. Roster age limit.** Stored rosters and archived rosters accept ages 18 and up with no upper bound (draftees start at 18-22, veterans keep aging).

## In scope

- Latest-season lookup: `getLeagueSeason` returns the season with the highest `index` for the league (still fails closed on an unreadable document naming the league).
- Widen the stored roster age check (D8); make `leagueId` optional on `Franchise` and `Roster` for unassigned teams (D2).
- Offseason for leagues without relegation: remove the `not-relegation` departure error and the `league.relegation` gates on the wizard and the league detail status card. Such leagues have `promotedCount` and `demotedCount` of 0, so the existing count rules accept an empty departure list.
- F-02: plan name checks only count plans whose season is in `offseason`.
- Pure approval logic: final roster per team (aging, progression, replacements, rookies, standard players first then goaltenders), chain-wide result (new seasons, franchise moves, new franchises, unassigned teams, roster documents, names to burn, trimmed plans).
- Repository: `prepareApproval(db, league)` (loads the chain, checks readiness, returns a summary or the reasons it cannot run) and `approveOffseason(db, league)` (runs through `acceptQueue`, re-checks, writes one `db.batch`).
- Wizard: new last step `approval` with a summary per league, the not-ready reasons, a two-tap confirm and the error text; on success go back to the league, where the new season shows.
- Tests for all of the above.

## Out of scope

- Fixing or reversing an approved offseason.
- Filling vacancies from the unassigned pool (11d); the pool only has to exist.
- Retired player records, franchise history screens (14); the plan and archives already hold the data.
- Editing team identities during the offseason ("Identity edit timing" in the overview). No build-plan item covers it yet; worth adding one.
- Export and import (9).

## Build loop

`workflow.stepReview` is `feature`: build all steps, run the narrow check per step, then one final review packet. `workflow.checkpointCommits` is `disabled`; `/complete` makes the single commit.

## Build steps

- [x] 1. **Multi-season foundation.** `getLeagueSeason` returns the highest-index season; `isRoster` accepts ages 18+ without an upper bound (and so `isArchivedTeam`). Update the tests that assumed 20-30.
  Done when: `season-repository` tests cover several seasons, a missing league, and an unreadable document; `roster.test.ts` accepts ages 18 and 35 and rejects 17; `npx tsc --noEmit` and `npm test` pass.
- [x] 2. **Unassigned teams.** `Franchise.leagueId` and `Roster.leagueId` become optional; `isFranchise` and `isRoster` accept a missing `leagueId` but still reject an empty string or a non-string. Fix every caller the typechecker flags.
  Done when: tests accept both shapes and reject `''` and `5`; a franchise without `leagueId` appears in no league's `listFranchises` or `listRosters`; `npx tsc --noEmit`, lint and `npm test` pass.
- [x] 3. **Offseason for leagues without relegation.** Drop `not-relegation` from `DepartureError` (type, `validateDepartures`, `departureErrorText`), and remove the `league.relegation` conditions in `wizard-screen.tsx` and `league-detail.tsx`. The departures step shows "Nobody leaves this league" and a Save plan button for a league with no departures.
  Done when: `offseason-plan.test.ts` accepts empty departures for a non-relegation league; a repository test saves a plan, stages nothing and walks protection to progression for a league with `relegation: false`; typecheck, lint and tests pass.
- [x] 4. **Plans of finished seasons stop feeding name checks (F-02).** One helper lists the plans whose season is in `offseason`; `listStagedNewTeams` and `unavailableNames` use it. Unreadable plan documents still fail closed. Mark F-02 `fixed` in the ledger.
  Done when: a test with an archived season's plan staging a draftee name shows that name available for a new draft pool and new team, while an offseason season's plan still reserves its names; tests pass.
- [x] 5. **Pure approval logic** in `src/offseason/approval.ts`. `finalRoster(team, plan, teams)` applies kept players, free agency picks, progression (`after`, `replacement`), D3 aging, rookies, and orders 6 standard then 2 goaltenders. `buildApproval(leagues)` takes each chain league's `{league, season, archive, plan, teams, franchises}` and returns the writes: next seasons and closed seasons, moved and new franchises, unassigned franchises and roster documents, rosters, names to burn, trimmed plans. It returns typed errors for: wrong roster shape (not 6 + 2 or duplicate ids), a progression entry missing for a progressing player, open vacancies or a team count different from `league.size`, a missing franchise.
  Done when: `approval.test.ts` covers aging (kept and picked players age, rookies and replacements do not), progression after and replacement, retirement and release removal, ordering, a promoted team that arrives in the linked league, a departing team with no link becoming unassigned, new team franchises (`fromSeason`, `initialGrade`), trimmed draft pool, names to burn, and each error; `npm test` passes.
- [x] 6. **Approval repository** in `src/offseason/approval-repository.ts`. `prepareApproval` loads every league in `chainLeagueIds`, requires each to have a season in `offseason`, a readable archive and plan, `stepStatuses` complete for every step before approval, and burned-name checks on every name that will be burned (as `acceptLeague` does). `approveOffseason` runs the same checks inside `acceptQueue` and writes one `db.batch` using `burnNamesOp`. Typed errors with `approvalErrorText`; unexpected failures propagate.
  Done when: memory-database tests cover a single league, a linked pair (both seasons advance, teams change leagues, rosters and franchises match), an unlinked relegation league (departures unassigned, new teams created), a non-relegation league, rerunning after success (fails with not-offseason and writes nothing), a burned-name clash and a blocked chain member (nothing written), and that the next season is `active` with index + 1; `npm test` passes.
- [x] 7. **Approval step in the wizard.** `wizard.ts` gets the `approval` step (title, instruction, status `incomplete` until the season leaves the offseason), `approval-step.tsx` shows per league: teams, retirements, rookies, new teams, and any not-ready reasons; a disabled Approve button when not ready; second-tap confirm; a busy state; the error text via `accessibilityRole="alert"`. On success navigate to the league. `wizard-screen.tsx` wires it; the status card text follows the new last step. Update `wizard.test.ts`.
  Done when: `wizard.test.ts` lists the ten steps and statuses; typecheck and lint pass; the user can approve in the app (manual check, see Testing).
- [x] 8. **Final gate.** Run `npx tsc --noEmit`, `npm run lint`, `npm test`; remove any dead code this feature leaves (`not-relegation` text, unused imports).
  Done when: all three commands pass and the spec's steps are checked.

## Files / areas

- `src/seasons/season-repository.ts`, `src/seasons/season.ts`: latest season.
- `src/rosters/roster.ts`, `src/teams/franchise.ts`, plus callers the typechecker flags: age limit and optional `leagueId`.
- `src/offseason/offseason-plan.ts` (`DepartureError`), `offseason-plan-repository.ts`, `rookie-draft-repository.ts`: departures and name checks.
- New: `src/offseason/approval.ts`, `approval-repository.ts` and their tests; `src/components/offseason/approval-step.tsx`.
- `src/offseason/wizard.ts` (+ test), `src/components/offseason/wizard-screen.tsx`, `offseason-status-card.tsx`, `departures-step.tsx`, `src/components/leagues/league-detail.tsx`.
- Reuse: `acceptQueue`, `burnNamesOp`, `getBurnedNames`, `chainLeagueIds`, `stepStatuses`, `participatingTeams`, `AGING_YEARS`, `openVacancies`, `MemoryDatabase`.

## Data / contracts

- `Season`: closed season gets `status: 'archived'`; new season `{ id: createId(), leagueId, index: old + 1, status: 'active' }`.
- `Franchise.leagueId?: string`; `Roster.leagueId?: string`. Absent means unassigned. Moved teams get the destination league id.
- Rosters are 6 standard players followed by 2 goaltenders, ids unique, ages 18+.
- Plan document: unchanged except `draftPool` = picked players only. The plan keeps its `seasonId` key.
- Everything is one `db.batch`, so approval applies fully or not at all. Approval and every other write that touches these documents run in `acceptQueue`.
- Result type: `{ ok: true, value } | { ok: false, error }` with kinds along the lines of `not-ready` (with per-league reasons), `burned-names`, `inconsistent` (shape or count problems), `storage`.
- The user's own text is never rendered raw into anything but `ThemedText`; league and team names come from stored data already shown that way.

## Testing

- Unit tests for every step as listed; pure logic with injected ids and rng, repository tests on `MemoryDatabase`.
- `npx tsc --noEmit`, `npm run lint` and `npm test` must pass. No combined Verify command is declared. On the same base commit the last audit saw tsc and lint clean and 700 tests passing; they were not re-run for this spec.
- No UI test runner exists, so the wizard step is checked by hand: finish a season for a small league, walk the wizard to Approval, approve, and check the new season, rosters, ages and the next finishing order screen. Repeat for a non-relegation league and a linked pair.

## Notes for the AI

- Mirror the patterns in `offseason-plan-repository.ts` (`acceptQueue`, fail-closed reads, typed `PlanError`-style results) and `acceptLeague` (checks first, one batch).
- Follow "later writes drop dependent fields": nothing in the plan is cleared by approval; it is only trimmed.
- Do not add a dependency or storage collection. Do not edit `ios/` or `android/`.
- Commits carry no AI attribution (AGENTS.md).

## Open questions

None blocking. D1 (chain-wide approval) and D2 (unassigned teams keep their franchise with no league) change behavior the most; say so if you want either different.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":13151,"specSha256":"46c550d9db07ba9ed064b8a1622871f0611f9b2a80a56bdfe4224919e6c3e5a9","branch":"refs/heads/feature/offseason-approval-and-next-season","head":"f1289971bf384dc818a500d4a5042021bf29a404","baseRef":"refs/heads/main","baseCommit":"f1289971bf384dc818a500d4a5042021bf29a404","sourceTree":"0d5bfca8123789457d6fd3244a9c2c9656861773","landing":"local-merge","absentOptional":[]} -->
