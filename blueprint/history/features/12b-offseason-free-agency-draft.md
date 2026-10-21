# Feature: Offseason: free agency draft

**From build-plan:** feature 12b
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/offseason-free-agency-draft`

## Goal

Add the free agency draft as a new wizard step after aging. The released players from 12a form the pool. Each participating team makes one pick, in a fixed order, with the commissioner choosing for the team on the clock. Picks are saved in the league's staged offseason plan. Live teams, rosters and the name registry are untouched until feature 13 approves the offseason.

## Decisions (from the user and the program specs)

- **Pool:** the players released in 12a (`releasedId`) from every participating team. The pool has one player per participating team and each team picks once, so the pool empties exactly.
- **One pick per participating team**, any player left in the pool, including the team's own released player. A pick that leaves a team over 6 position players or 2 goaltenders is allowed and flagged (12a decision); shortages are filled by feature 13.
- **Order (user decision):**
  1. Demoted arrivals (teams coming down from the league above) pick first, among themselves by their finish in their own league, best first.
  2. Then this league's staying teams, by their finish this season, best first.
  3. Then promoted arrivals (teams coming up from the league below), among themselves by their finish in their own league, best first.
  New teams do not take part. (Feature 13's regular draft uses the reverse emphasis: promoted arrivals go before everyone and demoted arrivals after everyone; recorded here so 13 does not re-ask.)
- **The commissioner makes every pick** ("team X is on the clock"). One mistaken pick can be undone with "Undo last pick" until aging changes.
- **Stale results:** changing a protection, re-running aging, saving departures or restaging arrivals clears the picks, like it clears aging results.

## In scope

- `freeAgentPicks` on `OffseasonPlan`: the picks in the order they were made.
- Pure helpers: draft order, pool, team on the clock, roster size flags.
- Repository operations to make a pick and to undo the last pick, and clearing picks whenever their inputs change.
- A `free-agency` wizard step with not-ready, on-the-clock, complete and surplus-warning states.

## Out of scope

- Applying picks to live rosters, ages, retirees or the registry, replacing retirees, the draft pool by need, the rookie draft and approval (13).
- Letting teams pass, trading, reordering teams, or more than one pick per team.
- Offseason screens for leagues without relegation (carried-over gap from 11a, 12a and 17).

## Build loop

Build one small step at a time. `workflow.stepReview` is `feature`: one review packet after all steps. `workflow.checkpointCommits` is disabled. `/complete` makes the final feature commit.

## Build steps

- [x] **Step 1 - Model and pure rules** - In `src/offseason/offseason-plan.ts` add `StagedFreeAgentPick { franchiseId: string; playerId: string }` and an optional `freeAgentPicks?: StagedFreeAgentPick[]` on `OffseasonPlan`; extend `isOffseasonPlan` (non-empty ids, each franchise id and each player id at most once). Add `src/offseason/free-agency.ts` with: `draftOrder(archive, plan, sourceArchives)` returning the participating franchise ids in the order above (`sourceArchives` is the linked leagues' archives, as in `ArrivalStatus.sources`; an arrival missing from its source archive sorts last in its group); `freeAgentPool(teams, changes, picks)` returning `{ player, fromFranchiseId }[]` of released players not yet picked, in team order; `teamOnTheClock(order, picks)` (the first team without a pick, or null when complete); `validatePick({ order, teams, changes, picks }, franchiseId, playerId)` returning `{ ok: true }` or one of `'aging-not-run' | 'draft-complete' | 'not-on-the-clock' | 'not-in-pool'`; and `rosterCounts(team, change, picked)` returning `{ standard, goalies }` after retirement, release and the picks the team made, plus `overLimit(counts)` (more than 6 position players or 2 goaltenders), `rosterNeeds(counts)` and `needsText(needs)` (the "1 position player and 1 goaltender" wording). *Done when:* unit tests cover `draftOrder` for no links, demoted arrivals first, promoted arrivals last, several arrivals in one group ordered by their own finish, departures removed, and a missing source archive; `freeAgentPool` before and during the draft; `teamOnTheClock` at the start, middle and end; every `validatePick` result; `rosterCounts` and `overLimit` for a normal team, a team that picked a position player after losing both goaltenders, and a team that picked its own released player; `isOffseasonPlan` with valid and each invalid `freeAgentPicks` case; `npm test` passes.
- [x] **Step 2 - Repository: pick, undo, clear** - Add to `src/offseason/roster-changes-repository.ts` (or a sibling file next to it if that keeps it readable) `makeFreeAgentPick(db, league, playerId)` and `undoFreeAgentPick(db, league)`, both through `acceptQueue`, each writing one `put` of this league's plan. Each loads the same way as `setProtection` (season in `offseason`, saved plan, archive, arrivals ready; errors `no-season`, `not-offseason`, `no-plan`, `no-archive`, `arrivals-not-ready`, fail closed with `storage`) and additionally needs the linked leagues' archives for the order. `makeFreeAgentPick` records the pick for the team on the clock and returns the stable errors `aging-not-run`, `draft-complete`, `not-in-pool` (mapping `validatePick`); `undoFreeAgentPick` removes the last pick, with `no-picks` when there is none. `setProtection` and `ageAndRelease` drop `freeAgentPicks` from the plan they write, and `saveOffseasonPlan` and `stageArrivals` drop it too. Extend `PlanError` and `planErrorText` with the new kinds. *Done when:* memory-database tests cover: a full draft in order for an unlinked league and for a linked pair with demoted and promoted arrivals (order checked); picking your own released player; `not-in-pool` for a player not released or already picked; `aging-not-run`; `draft-complete`; undo and `no-picks`; picks cleared by a changed protection, a re-run of aging, saving departures and restaging arrivals; `arrivals-not-ready`; a failing write leaves the old plan; the live roster, franchise and registry collections are unchanged after every operation; `npm test` passes.
- [x] **Step 3 - Wizard step** - In `src/offseason/wizard.ts` add `'free-agency'` after `'aging'` to `WIZARD_STEPS` and `STEP_INFO` (title "Free agency draft"), complete when at least one team takes part and every participating team has a pick, and update its tests. Add `src/components/offseason/free-agency-step.tsx` and wire it in `wizard-screen.tsx` (which passes the arrival sources already in the arrival status). Screen: "Pick n of m", "<team> is on the clock", what that team needs to reach a full roster of 6 position players and 2 goaltenders after its retirement and release (for example "Needs: 1 position player and 1 goaltender", "2 goaltenders", or "nothing"; added at the user's request), the pool as a tappable list (player line with age `age + AGING_YEARS` and "released by <team>"; the team's own player marked), a tap makes the pick and refreshes; the picks so far one line each ("1. Team picked Player"); "Undo last pick" when there are picks; when complete "The draft is complete" and the roster check: one line per team over the limit ("Team has 7 position players; fix this by hand before approval") or "No team is over the limit". States: not ready (aging not run, or arrivals not ready) with the reason, no teams, error text from `planErrorText`, buttons and rows disabled while a write runs. Names render as plain text; rows have accessibility labels "Pick <name>, <team>". *Done when:* lint, typecheck and `npm test` pass; every state above is reachable by reading the screen against the repository results.
- [x] **Step 4 - Device check** - The user runs the app on web and a tablet: with an unlinked relegation league and again with a linked pair, run the wizard through aging, then the free agency step; confirm the pool lists exactly the released players, the order is demoted arrivals, staying teams by finish, then promoted arrivals, a team can pick its own released player, undo works, Next unlocks only after every team has picked, the over-limit warning appears when a team ends up with 7 position players or 3 goaltenders, re-running aging or changing a protection clears the picks, and reload keeps everything; live rosters, ages and burned names are unchanged. *Done when:* the user confirms, or any difference is fixed or recorded here. *Result:* the user ran the process and reported "the process looks good now" (after the team-needs line was added to the free agency screen at their request); individual checklist items were not itemized.

## Files / areas

- New: `src/offseason/free-agency.ts` (+ test), `src/components/offseason/free-agency-step.tsx`, tests for the new repository operations (next to `roster-changes-repository.test.ts` or in a new file).
- Changed: `src/offseason/offseason-plan.ts` (+ test), `src/offseason/roster-changes-repository.ts` (+ test: clearing picks), `src/offseason/offseason-plan-repository.ts` (+ test: `PlanError`, `planErrorText`, clearing in `stageNow`; `saveNow` already builds a fresh plan), `src/offseason/wizard.ts` (+ test), `src/components/offseason/wizard-screen.tsx`.
- Reuse, unchanged: `participatingTeams`, `arrivalsReady`, `AGING_YEARS`, `getArrivalStatus` (its `sources` give the linked leagues' archives), `playerLine`, `acceptQueue`, `Button`, the wizard shell and hooks.

## Data / contracts

- No new collection. `offseason-plans` documents gain an optional `freeAgentPicks` array; an old document without it stays valid, so no migration or version bump.
- `StagedFreeAgentPick`: `{ franchiseId: string; playerId: string }`; `playerId` is a released player's roster id from some team's `releasedId`; picks are stored in the order they were made, one per franchise, each player at most once.
- The order is derived, never stored, from the current archive, plan and linked-league archives, so it cannot disagree with them; a pick for a team that is not on the clock cannot be made.
- Consumer contract for 13: the drafted player moves from the releasing team to the picking team when the offseason is applied (all players of participating teams age by `AGING_YEARS` first); retirees leave; teams then fill missing slots by need; teams over 6 position players or 2 goaltenders are fixed by hand before approval; the regular draft goes promoted arrivals first and demoted arrivals last.
- Writes: one `put` of this league's plan per operation, through `acceptQueue`; reads fail closed; no franchise, roster, retired-player or registry document is written.
- Player and team names are list or user text and render as plain `ThemedText`.

## Testing

- Pure rules and plan validation: unit tests as in step 1.
- Repository: memory-database tests as in step 2.
- UI: lint and typecheck plus the manual device check in step 4. No browser test command is configured and none is claimed.
- Baseline before this feature: `npm test` 600 tests pass, `npx tsc --noEmit` and `npm run lint` clean (no combined Verify command exists). Run all three before declaring done.

## Notes for the AI

- Read the Expo SDK 57 docs before using any Expo or React Native API not already used in `aging-step.tsx` or `protection-step.tsx`.
- Follow `roster-changes-repository.ts` for loading and results, and `protection-step.tsx` and `aging-step.tsx` for step layout, errors and accessibility.
- Do not write to franchise, roster, retired-player or name-registry collections, and do not change another league's plan.
- Do not start dev servers; ask the user to run web and tablet checks.
- Commits carry no AI attribution (AGENTS.md rule). Blueprint files are tracked in git, so the spec, archive and findings ledger go in the work commit.

## Open questions

Reversible choices, built as stated; tell me if any is wrong:

1. The draft has exactly one pick per participating team; a team cannot pass or pick twice (the pool is one player per team).
2. Undo is limited to the last pick, so the order stays consistent.
3. Prerequisite gap carried over, not fixed here: leagues without promotion and relegation have no offseason screens, so they cannot use this draft either.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":12423,"specSha256":"10789cc66e45c506f22ed5f6a7515ee24b223debf7e43ad39c5d45ebe800ae6f","branch":"refs/heads/feature/offseason-free-agency-draft","head":"43d32e07fc095babd87c26fef4f94471680c81ee","baseRef":"refs/heads/main","baseCommit":"43d32e07fc095babd87c26fef4f94471680c81ee","sourceTree":"66ddaeef584cab907315bb004770807d9799df22","landing":"local-merge","absentOptional":[]} -->
