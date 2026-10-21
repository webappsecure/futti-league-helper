# Feature: Offseason: protection, aging and release

**From build-plan:** feature 12a
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/offseason-protection-aging-and-release`

## Goal

Let the commissioner protect one player on each participating team, then have the app work out who retires and who is released into the free agency pool. Retirement and release are random-tie-broken rules from the program specs, run by the app and shown to the commissioner; the commissioner only chooses the protected players. Everything is saved in the league's staged offseason plan. Live teams, rosters, ages and the name registry are untouched until feature 13 approves the offseason.

Feature 12 was split with the user: 12a is protection, aging, retirement and release; 12b is the free agency draft from the released pool.

## Decisions (from the user and the program specs)

- **Participating teams** are the teams staying in this league (the season's archived teams that are not promoted or demoted) plus the teams staged as arrivals from linked leagues. New teams do not take part. Teams leaving this league do not take part here; where they land they are arrivals and take part in that league's plan.
- **Rosters used** are the archived season-end rosters for staying teams (live rosters are unchanged until approval) and the staged, already adjusted rosters for arrivals.
- **Protect**: exactly one player per participating team, any of its 8 players, chosen by the commissioner. A protected player cannot retire and cannot be released.
- **Aging**: every player on a participating team gets one year older. Ages are not rewritten in the plan; the plan records only who is protected, retired and released, and feature 13 adds one year (`AGING_YEARS = 1`) to every player of a participating team when it applies the offseason. The screen shows the aged age.
- **Retirement**: one unprotected player per team retires, the oldest. Ties on age: a goaltender goes before a position player; then the lowest rated (position player OF+DE, goaltender GO); then the lowest SP; then random. Retirement uses the age before the one-year aging, which gives the same order.
- **Release**: one player per team, chosen uniformly at random from the players who are neither protected nor retired, goes to the free agency pool. A team may later draft its own released player (12b).
- **Replacing retirees and filling roster gaps** is feature 13 (draft pool by need). The free agency draft is 12b.
- **Re-running** "Age, retire and release" rerolls the random parts (ties and release); any change to a protection, to the departures or to the staged arrivals clears the results so nothing stale is kept.
- **Free agency picks (12b decision recorded here):** a team may pick any remaining player; a team left over 6 position players or 2 goaltenders is flagged and fixed by hand before approval.

## In scope

- `teamChanges` on `OffseasonPlan`: per participating team, the protected player and, after aging, the retired and released players.
- Pure helpers: participating teams, retirement choice, release choice, building all team changes from the protections, a check that saved changes still match the participating teams (every change is for a participating team and names players on its roster; teams may still lack a protection), and an arrivals-ready check.
- Repository operations to set a team's protection and to run aging, retirement and release for all teams.

## Out of scope

- The free agency draft and its order (12b), the rookie draft, draft pool, progression and replacing retirees (13), approval (13), and applying anything to live rosters, ages, the registry or the retired-player records.
- Offseason cards or plans for leagues without promotion and relegation: the Offseason card is only shown for a relegation league (feature 11a), so this feature has the same limit. See Open questions.
- Editing results by hand (protect a different player and re-run instead), per-player rerolls, undo history.

## Build loop

Build one small step at a time. `workflow.stepReview` is `feature`: one review packet after all steps. `workflow.checkpointCommits` is disabled. `/complete` makes the final feature commit.

## Build steps

- [x] **Step 1 - Model and pure rules** - In `src/offseason/offseason-plan.ts` add `StagedTeamChange { franchiseId: string; protectedId: string; retiredId?: string; releasedId?: string }` and an optional `teamChanges?: StagedTeamChange[]` on `OffseasonPlan`; extend `isOffseasonPlan` (non-empty ids, franchise ids unique, `retiredId` and `releasedId` both present or both absent, and when present distinct from each other and from `protectedId`). Add `src/offseason/roster-changes.ts` with: `AGING_YEARS`; `participatingTeams(archive, plan)` returning `{ franchiseId, origin: 'staying' | 'arrival', players }[]` (staying teams in finishing order without the departing ones, then arrivals in staged order); `pickRetiree(players, protectedId, rng)` and `pickRelease(players, protectedId, retiredId, rng)` returning player ids (uniform random pick from the existing `Rng`); `buildTeamChanges(teams, protections, rng)` returning a complete `StagedTeamChange[]` or the franchise ids missing a protection; `changesAreCurrent(changes, teams)` (every change is for a participating team and every referenced id is on its roster; protections are set one team at a time, so missing teams are allowed); `arrivalsReady({ expected, staged, current, blocked })` (true when nothing blocks and either no teams are expected and none staged, or the staged arrivals are current). *Done when:* unit tests cover `participatingTeams` for no departures, some departures, arrivals and a new team being ignored; `pickRetiree` for oldest wins, protected oldest skipped, age tie goalie before position player, age tie among position players by lowest OF+DE then lowest SP then random (using `rngFromDice`-style fixed rolls), the same among goalies by GO; `pickRelease` never returns the protected or retired player and is uniform over the rest for fixed rolls; `buildTeamChanges` with all and with missing protections; `changesAreCurrent` true, protections for only some teams, a team that no longer takes part, and unknown player ids; `arrivalsReady` for each case; `isOffseasonPlan` with valid and each invalid `teamChanges` case; `npm test` passes.
- [x] **Step 2 - Repository: protect and run** - Add `src/offseason/roster-changes-repository.ts` with `setProtection(db, league, franchiseId, playerId)` and `ageAndRelease(db, league, options?)`, both through `acceptQueue`, each writing one `put` of this league's plan; `options` is `{ rng? }` (default `Math.random`). Both require this league's season in `offseason`, its own saved plan and its archive (errors `no-season`, `not-offseason`, `no-plan`, `no-archive`), and `getArrivalStatus` showing `arrivalsReady` (error `arrivals-not-ready`). `setProtection` requires the franchise to be a participating team and the player to be on its roster (error `unknown-player`), replaces that team's entry, and drops every `retiredId` and `releasedId` in the plan. `ageAndRelease` requires a protection for every participating team (error `protection-incomplete`) and writes `teamChanges` with retired and released players for all teams. Extend `PlanError` and `planErrorText` with the new kinds. `saveOffseasonPlan` and `stageArrivals` drop `teamChanges` (their results depend on who participates and on the adjusted ratings) while still keeping `arrivals` and `newTeams` as before. Reads fail closed (an unreadable plan, archive or arrival source is a `storage` error). *Done when:* memory-database tests cover: protect then run for staying teams only, with arrivals, and with departures; protecting twice replaces; protecting after a run clears the results; `protection-incomplete`; `unknown-player` for a wrong team and a wrong player; `arrivals-not-ready` when linked arrivals are missing or stale; errors for no season, not offseason, no plan and no archive; the live roster, franchise and name-registry collections are unchanged after every operation; a re-run with different rolls changes the release; saving departures or staging arrivals clears `teamChanges` but keeps `newTeams`; `npm test` passes.
- [x] **Step 3 - Section in the Offseason card** - *Moved to the offseason wizard (new build-plan item).* The busy section built here was removed at the user's request; the protection, aging and release screens become wizard steps there, using `participatingTeams`, `setProtection`, `ageAndRelease` and `changesAreCurrent` from steps 1-2 unchanged. *Done when:* nothing in this feature adds UI; lint, typecheck and `npm test` pass.
- [x] **Step 4 - Device check** - *Moved to the wizard item, where the screens exist.* Original check, to run there: with a relegation league, end the season, save departures and (for a linked pair) stage arrivals; confirm the listed teams are the staying teams plus arrivals and not the departing or new teams; protect one player per team and confirm the count; run aging and confirm each team has exactly one retiree (the oldest unprotected, goaltender first on an age tie, never the protected player) and one released player who is neither; confirm ages show one year older; re-run and confirm only the release (and ties) can change; change a protection and confirm the results clear; reload and confirm everything persisted; confirm live rosters, ages and burned names are unchanged. *Done when:* the user confirms, or any difference is fixed or recorded here.

## Files / areas

- New: `src/offseason/roster-changes.ts` (+ test), `src/offseason/roster-changes-repository.ts` (+ test).
- Changed: `src/offseason/offseason-plan.ts` (+ test), `src/offseason/offseason-plan-repository.ts` (+ test: `PlanError`, `planErrorText`, clearing in `saveNow` and `stageNow`).
- Reuse, unchanged: `getArrivalStatus` and `ArrivalStatus`, `src/seasons/season-archive.ts`, `src/rosters/roster.ts`, `src/rosters/player-line.ts` (`playerLine`), `src/rules/dice.ts` (`Rng`), `src/seasons/accept-queue.ts`, `useOffseasonPlan`, `useArrivalStatus`, `Button`.

## Data / contracts

- No new collection. `offseason-plans` documents gain an optional `teamChanges` array; an old document without it stays valid, so no migration or version bump.
- `StagedTeamChange`: `{ franchiseId: string; protectedId: string; retiredId?: string; releasedId?: string }`. Player ids are the roster player ids already stored in the archive or the staged arrival. `retiredId` and `releasedId` are both set (after a run) or both absent; `protectedId`, `retiredId` and `releasedId` are three different players of the same team. At most one entry per franchise.
- Consumer contract for 12b and 13: participating teams are those returned by `participatingTeams`; every player of a participating team ages by `AGING_YEARS` when the offseason is applied; the free agency pool is the set of `releasedId` players; retirees leave the league as retired players and leave a vacancy that 13 fills.
- Writes: one `put` of this league's plan per operation, through `acceptQueue`. Reads fail closed. No franchise, roster, retired-player or registry document is written.
- Randomness: `rng` is injectable so tests are exact; ties and the release use it.
- Player and team names are user or list text and render as plain `ThemedText`; the protect controls have accessibility labels and a selected state.

## Testing

- Pure rules and plan validation: unit tests as in step 1.
- Repository: memory-database tests as in step 2.
- UI: lint and typecheck plus the manual device check in step 4. No browser test command is configured and none is claimed.
- Baseline before this feature: `npm test` 556 tests pass, `npx tsc --noEmit` and `npm run lint` clean (no combined Verify command exists). Run all three before declaring done.

## Notes for the AI

- Read the Expo SDK 57 docs before using any Expo or React Native API not already used in `arrivals-section.tsx`, `new-teams-section.tsx` or `offseason-card.tsx`.
- Follow `offseason-plan-repository.ts` for result and error shapes and `new-teams-section.tsx` for section layout and error text.
- Do not write to franchise, roster, retired-player or name-registry collections, and do not change another league's plan.
- Do not start dev servers; ask the user to run web and tablet checks.
- Commits carry no AI attribution (AGENTS.md rule).

## Open questions

Reversible choices, built as stated; tell me if any is wrong:

1. The program specs say the oldest player retires and, on a tie, the lowest rated one; the project overview adds goaltender first, then SP, then random. Built as the overview states.
2. The release is uniform over all unprotected, non-retired players, goaltenders included (so a team can lose both goaltenders to retirement and release; feature 13 fills the gap).
3. Prerequisite gap, not fixed here: leagues without promotion and relegation have no Offseason card and cannot save a plan (11a gated both). They need protection, aging and release too, so this should be handled before feature 13's approval (a `/fix` or part of 13). 12a builds for relegation leagues only.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":13179,"specSha256":"cb61515fb0901bb306c7d89e60e0c46103e77a0f42c14c7de0b54c4a250cb6ea","branch":"refs/heads/feature/offseason-protection-aging-and-release","head":"512290ff9e2db06c13771df1bd786befb125abae","baseRef":"refs/heads/main","baseCommit":"512290ff9e2db06c13771df1bd786befb125abae","sourceTree":"bda849d1ababed383ccb6d5f6f5fef38398c3c01","landing":"local-merge","absentOptional":[]} -->
