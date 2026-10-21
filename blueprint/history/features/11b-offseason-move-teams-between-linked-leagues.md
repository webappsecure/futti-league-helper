# Feature: Offseason: move teams between linked leagues

**From build-plan:** feature 11b
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/offseason-move-teams-between-linked-leagues`

## Goal

For linked leagues, show where each departing team goes and stage the teams that arrive in this league. Teams demoted from the league above and promoted from the league below arrive here with their ratings adjusted (the 11a rules) and their control stars rerolled. The adjusted rosters are saved in this league's staged offseason plan. Live teams and rosters are still untouched until feature 13 approves the offseason.

11a (departure plan and rating rules) is merged. 11c (new and former teams) fills any remaining vacancies.

## Decisions (from the user and the plans)

- **Staged, not applied.** Arrivals are stored in the offseason plan as adjusted roster copies. No franchise `leagueId` or roster document changes here.
- **Direction and ratings** (confirmed in 11a): a team arriving from below (promoted) is reduced; a team arriving from above (demoted) is raised. Control stars are rerolled for every standard player (`adjustRoster`).
- **Linked leagues only.** Arrivals come from the directly linked league above and below (`leagueAbove`/`leagueBelow`, which require a two-way link). The link rules already guarantee relegation is on, names match styles, and `upper.demotedCount == lower.promotedCount`.
- **Who arrives.** The teams in the linked league's saved plan: its `demoted` list when it is above, its `promoted` list when it is below. Rosters come from that league's season archive (the end-of-season snapshot).
- **Staging is an explicit commissioner action** because the rerolled stars are random and must stay stable once seen. Restaging rerolls them.

## In scope

- Pure helpers to work out the expected arrivals, build the adjusted staged arrivals, and check whether staged arrivals are still current.
- An additive `arrivals` field on `OffseasonPlan`, preserved when departures are saved.
- Repository functions to read the arrival status and to stage (or restage) arrivals.
- An "Arrivals" section in the Offseason card with loading, error, blocked, ready-to-stage, staged and stale states.

## Out of scope

- New created teams, former teams, grade rolls for new teams (11c). A departing team with no linked league to go to simply leaves; the vacancy is handled in 11c.
- Applying anything to live data, creating season N+1, protection, aging, free agency, drafts, progression, approval (12, 13).
- Name checks (arriving teams keep their existing names; nothing is burned in this feature).
- Chains handled beyond the two direct neighbors, and a "before and after" rating comparison view.

## Build loop

Build one small step at a time. `workflow.stepReview` is `feature`: one review packet after all steps. `workflow.checkpointCommits` is disabled. `/complete` makes the final feature commit.

## Build steps

- [x] **Step 1 - Arrival model and pure helpers** - In `src/offseason/offseason-plan.ts` add `StagedArrival { franchiseId, fromLeagueId, sourceSeasonId, movement: 'promoted' | 'demoted', players: RosterPlayer[] }` and an optional `arrivals?: StagedArrival[]` on `OffseasonPlan`; extend `isOffseasonPlan` to validate each arrival (non-empty ids, known movement, `players` accepted by `isRoster`, no repeated `franchiseId`). Add `src/offseason/arrivals.ts` with: `expectedArrivals(sources)` where each source is `{ league, direction: 'above' | 'below', archive, plan }`, returning `{ franchiseId, fromLeagueId, sourceSeasonId, movement }` entries (above gives its `demoted` ids as `'demoted'`, below gives its `promoted` ids as `'promoted'`; sources whose plan is null give nothing); `buildArrivals(expected, sources, rng)` which copies each team's `players` from its archive and runs `adjustRoster(players, movement, rng)` (input unchanged, order of `expected` kept, an id missing from its archive is an error); `arrivalsAreCurrent(staged, expected)` true when both name the same franchise ids with the same `fromLeagueId`, `sourceSeasonId` and `movement`, ignoring order. *Done when:* unit tests with `rngFromDice` cover above-only, below-only and both sources, a source with no plan, ratings changed in the right direction on the copy while the archive stays unchanged, a missing archive team, `arrivalsAreCurrent` for same, reordered, extra, missing and changed-source cases, and `isOffseasonPlan` with and without valid arrivals; `npm test` passes.
- [x] **Step 2 - Repository: status and staging** - In `src/offseason/offseason-plan-repository.ts`: change `saveNow` to keep an existing plan's `arrivals` when departures are saved (`{ ...existing, promoted, demoted }`); add `getArrivalStatus(db, league)` and `stageArrivals(db, league, rng = Math.random)` (the latter through `acceptQueue`). Both load all leagues (`listLeagues`), resolve `leagueAbove`/`leagueBelow` using the current league record, and for each neighbor read its season (`getLeagueSeason`), archive (`getSeasonArchive`) and plan (`getOffseasonPlan`). `getArrivalStatus` returns `{ expected, staged, current, blocked }` where `blocked` lists, per neighbor, why nothing can arrive yet: `'no-season'`, `'not-offseason'` (neighbor season not ended), `'no-archive'` or `'no-plan'` (neighbor has not saved its plan). `stageArrivals` requires this league's season in `offseason` and its own saved plan (errors `no-season`, `not-offseason`, `no-plan`), refuses while any neighbor is blocked (error `blocked`, carrying the reasons), builds arrivals with `buildArrivals`, and writes the plan with `arrivals` set (replacing any earlier ones) in one `put`. A league with no linked neighbors stages an empty list. All reads fail closed (an unreadable neighbor document is a `storage` error, never "none"). Result and error shapes follow `PlanResult`; add text via a helper like `planErrorText`. *Done when:* memory-database tests with two linked leagues (both accepted and ended, plans saved) cover: staging for the lower league (arrivals from above are raised, stars rerolled, ids match the upper plan's `demoted`), staging for the upper league (arrivals from below are reduced), a league with a neighbor on each side, restaging replaces arrivals, saving departures afterwards keeps staged arrivals, arrivals become not-current after the neighbor changes its plan, each blocked reason, no write on error, a failed batch leaves the old plan, and an unlinked league stages an empty list; `npm test` passes.
- [x] **Step 3 - Arrivals section in the Offseason card** - Add `useArrivalStatus` (loading/error/ready with `refresh`/`retry`, latest-only like `useOffseasonPlan`) and render an "Arrivals" section inside `src/components/offseason/offseason-card.tsx` below the departures editor, only for a league with a linked neighbor. It shows, per direction, the teams expected here by name (`displayName` of the archived identity) and says whether they were promoted from below or demoted from above; a blocked neighbor shows its reason in plain words (for example "Premier has not saved its plan yet"); when nothing is staged a "Stage arrivals" button is enabled only when this league's own plan is saved and no neighbor is blocked; when staged and current it lists each arriving team's players as "NAME OF x DE y SP z, stars" and goalies as "NAME GO n SP z" with a "Restage arrivals" button (which says the stars will be rerolled); when staged but not current it shows a warning that the other league's plan changed and offers "Restage arrivals". Buttons disable while a write runs; errors render with `accessibilityRole="alert"`; team and player names are plain text. The card also refreshes arrivals after this league's own departures are saved, and the Season card's order change keeps working through the existing `archiveVersion`. *Done when:* lint, typecheck and `npm test` pass, and each state above is reachable by reading the component against the repository results (device check in step 4).
- [x] **Step 4 - Device check** - The user runs the app on web and a tablet with two linked relegation leagues: end both seasons; in the lower league confirm the Arrivals section is blocked until the upper league saves its plan; save both plans; stage arrivals in each league and confirm the arriving teams, directions and adjusted ratings look right (demoted raised, promoted reduced); restage and confirm the stars can change; change the upper plan and confirm the lower league shows the stale warning; reload and confirm staged arrivals persisted; confirm no team or roster in either league changed; delete a league and confirm the other keeps working. *Done when:* the user confirms, or any difference is fixed or recorded here. Result: confirmed by the user on web and tablet.

## Files / areas

- New: `src/offseason/arrivals.ts` (+ test), `src/offseason/use-arrival-status.ts`.
- Changed: `src/offseason/offseason-plan.ts` (+ test), `src/offseason/offseason-plan-repository.ts` (+ test), `src/components/offseason/offseason-card.tsx`.
- Reuse, unchanged: `src/offseason/rating-adjust.ts` (`adjustRoster`), `src/leagues/league-links.ts` (`leagueAbove`, `leagueBelow`), `listLeagues`, `getLeagueSeason`, `getSeasonArchive`, `acceptQueue`, `isRoster`, `Button`, `ThemedText`/`ThemedView`.

## Data / contracts

- No new collection. `offseason-plans` documents gain an optional `arrivals` array; an old document without it stays valid, so no migration or version bump.
- `StagedArrival`: `{ franchiseId: string; fromLeagueId: string; sourceSeasonId: string; movement: 'promoted' | 'demoted'; players: RosterPlayer[] }`. `players` is the adjusted copy (6 standard + 2 goalies in the archive order). `franchiseId` is unique within the list.
- Expected arrivals are derived, never stored: the neighbor's current `demoted` (above) or `promoted` (below) ids, tied to the neighbor's season id. Staged arrivals are current only while they match that list; this check replaces any cross-document write, so saving one league's plan never writes another league's plan.
- Writes: only `stageArrivals` writes arrivals, to this league's plan, through `acceptQueue`, as one `put`. Reads fail closed. No franchise or roster document is written.
- Randomness: `stageArrivals` takes an injectable `Rng` (default `Math.random`) so tests are exact.
- Team and player names are user text and render as plain `ThemedText`.

## Testing

- Pure helpers and plan validation: unit tests as in step 1.
- Repository: memory-database tests as in step 2, with a helper that builds two linked leagues, accepts and ends both seasons and saves both plans.
- UI: lint and typecheck plus the manual device check in step 4. No browser test command is configured and none is claimed.
- Run lint, `npx tsc --noEmit` and `npm test` before declaring done (baseline: 492 tests pass).

## Notes for the AI

- Read the Expo SDK 57 docs before using any Expo or React Native API not already used in `offseason-card.tsx`.
- Follow `offseason-plan-repository.ts` and `offseason-card.tsx` for result shapes, error text helpers and hook patterns.
- Do not write to franchise or roster collections, and do not change another league's plan.
- Do not start dev servers; ask the user to run web and iOS checks.
- Commits carry no AI attribution (AGENTS.md rule).

## Open questions

Reversible choices, built as stated; tell me if any is wrong:

1. Staging is an explicit button, and restaging rerolls control stars (rather than staging automatically when both plans exist).
2. Arrivals are staged from the end-of-season archive rosters, and a neighbor that has not ended its season or saved its plan blocks staging with a plain reason.
3. A departing team whose league has no linked neighbor in that direction just leaves; 11c decides how vacancies are filled.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":11817,"specSha256":"6ac84224dc0a2aada79377b0275645c579b91b5c03260524a3ca8c2847061ae7","branch":"refs/heads/feature/offseason-move-teams-between-linked-leagues","head":"6114a74cdc020b2742d0c4805b489ece41570cbe","baseRef":"refs/heads/main","baseCommit":"6114a74cdc020b2742d0c4805b489ece41570cbe","sourceTree":"7d11f73d0425d73d9430add677766506e44e207a","landing":"local-merge","absentOptional":[]} -->
