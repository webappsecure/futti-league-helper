# Feature: Offseason plan and rating rules

**From build-plan:** feature 11a
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/offseason-plan-and-rating-rules`

## Goal

Start the offseason for a relegation league whose season has ended (`status: offseason`). The commissioner picks which teams leave through promotion and which through relegation, starting from a suggestion taken from the saved finishing order. The choice is saved as a **staged offseason plan** and nothing in the live teams or rosters changes. Also add the pure, tested rules that 11b and 11c will use: rating adjustment for teams that change leagues and the grade roll for newly created replacement teams.

11 was split into 11a/11b/11c with the user (2026-10-20). 11b moves teams between linked leagues; 11c fills vacancies with new and former teams. Only 11a is specced here.

## Decisions (confirmed with the user)

- **Staged plan.** Offseason moves are stored in a plan attached to the season. Live franchise/roster data is untouched until feature 13 approves the offseason and creates the next season.
- **Departures are suggested, then editable.** The top `promotedCount` teams (promoted) and bottom `demotedCount` teams (demoted) from the saved finishing order are pre-selected; the commissioner can change them. The counts must equal the league settings.
- **Sources** for replacements (built in 11b/11c): teams arriving from the linked league, newly created teams, and former teams.

## In scope

- Pure rating adjustment for an arriving team (`demoted` or `promoted`) and the replacement grade roll for a new team.
- `OffseasonPlan` document, pure suggestion and validation, repository read/save, cascade delete with the league.
- An "Offseason" card in the league detail screen, shown while the season is `offseason` and the league has relegation on.
- Loading, error, invalid-selection, saving and saved states.

## Out of scope

- Moving teams to or from linked leagues, rating changes applied to real rosters (11b), new or former teams (11c).
- Protection, aging, retirement, free agency, draft, progression, approving the offseason, creating season N+1, setting `archived` (12, 13).
- Replacing `getLeagueSeason`: season N+1 is not created until feature 13, so a league still has exactly one season through 11a-11c. Feature 13 must replace it (the earlier note that 11 would do it no longer applies).
- Showing or hiding the initial grade, history browsing (14), export/import (9).

## Build loop

Build one small step at a time. `workflow.stepReview` is `feature`: one review packet after all steps. `workflow.checkpointCommits` is disabled. `/complete` makes the final feature commit.

## Build steps

- [x] **Step 1 - Rating adjustment and grade roll (pure)** - Add `src/offseason/rating-adjust.ts` with `adjustRoster(players, movement, rng)` and `replacementGrade(vacancy, roll)`. `movement` is `'promoted'` (team moves up, arriving from the league below) or `'demoted'` (team moves down, arriving from the league above). Rules per `futti-program-specs.txt` section 4, applied by the competition the team moves into: **promoted** teams (moving up to stronger competition) are reduced: standard players lose 1 offense and 1 defense, each minimum 1; goalies move 2 steps down with `addGoaltending(rating, -2, { min: 31 })`. **Demoted** teams (moving down to weaker competition) are raised: standard players add 1 to each of offense and defense, each capped at 5; if both rising would make the total exceed 8, only the lower one rises; a rise that would still make the total exceed 8 does not happen (so 4/4 stays 4/4, 4/3 becomes 4/4, 3/3 becomes 4/4); goalies move 2 steps up with `addGoaltending(rating, 2, { max: 46 })`. For every standard player, control stars are regenerated with `controlStars(newTotal, rng)` (existing function), and `rolls.stars` is updated to that roll; age, sportsmanship, name and id never change. Input is not mutated. `replacementGrade('promoted', roll)`: 1 = A, 2-3 = B, 4-6 = C; `replacementGrade('demoted', roll)`: 1 = C, 2-3 = D, 4-6 = F; `vacancy` names the departing team's movement. A roll outside 1-6 throws `RangeError`. *Done when:* unit tests with `rngFromDice` cover each movement at the min/max bounds (reduction for promoted, raise for demoted), the 4/3, 4/4, 5/3, 5/2 and 3/3 cases, goalie crossing 41/36 and the 31 and 46 limits, stars regenerated from the new total, no mutation, unchanged fields, and every grade-roll face; `npm test` passes.
- [x] **Step 2 - Plan model, suggestion and validation (pure)** - Add `src/offseason/offseason-plan.ts`: `OFFSEASON_PLAN_COLLECTION = 'offseason-plans'`; `OffseasonPlan { seasonId, leagueId, promoted: string[], demoted: string[] }` (franchise ids); `isOffseasonPlan`; `suggestDepartures(archive, league)` (best `promotedCount` by `position` are promoted, worst `demotedCount` are demoted); `validateDepartures({ archive, league, promoted, demoted })` returning ok or an error kind: `'not-relegation'` (league has relegation off), `'promoted-count'` / `'demoted-count'` (selected number differs from the league setting), `'unknown-team'` (id not in the archive), `'overlap'` (a team in both lists or listed twice), `'too-few-teams'` (promoted + demoted greater than the number of teams), plus a text helper. *Done when:* unit tests cover suggestion with 0 promoted, 0 demoted and both, a normal valid choice, and each error kind; `isOffseasonPlan` accepts a good document and rejects missing, wrong-typed and duplicate ids; `npm test` passes.
- [x] **Step 3 - Plan repository and cascade delete** - Add `src/offseason/offseason-plan-repository.ts`: `getOffseasonPlan(db, seasonId)` (null when none; fails closed on an unreadable document) and `saveOffseasonPlan(db, league, promoted, demoted)` wrapped in `acceptQueue`. Save requires a season in `offseason` (error `not-offseason`), reads the archive with `getSeasonArchive` (error `no-archive`), applies `validateDepartures`, and writes one `put` for the plan with id = season id. Error kinds: the validation kinds, `'no-season'`, `'not-offseason'`, `'no-archive'`, `'storage'`. Add the plan delete to `deleteLeagueNow` in `src/leagues/league-repository.ts`, in the same batch as the season and archive deletes. *Done when:* memory-database tests cover save happy path and overwrite, rejected save in an `active` season, with no archive, with invalid departures (no write), unreadable stored plan fails closed, a failed batch leaves the previous plan, and league delete removes the plan; `npm test` passes.
- [x] **Step 4 - Hook and Offseason card** - Add `useOffseasonPlan` (loading/error/ready with `refresh`/`retry`, latest-only like `useSeasonArchive`) and `src/components/offseason/offseason-card.tsx`, rendered from `league-detail.tsx` below the Season card when the season is `offseason` and `league.relegation` is true. The card lists the teams in finishing order (position, `displayName(identityForSeason(...))`) with two toggle buttons per row, "Promote" and "Demote", exposed with `accessibilityRole="button"` and `accessibilityState={{ selected }}`. It starts from the saved plan, or `suggestDepartures` when none is saved, and shows "Promoted X of N, Demoted Y of M". Selecting a team in one list removes it from the other. "Save plan" is disabled while the selection is invalid or a write is running; errors and the validation text render as `ThemedText` with `accessibilityRole="alert"`; after a save the card shows "Plan saved" and says that nothing changes until the offseason is approved. A saved plan remains when the finishing order is corrected later; the card shows it as saved and the commissioner can edit it. Team names render as plain text. *Done when:* lint, typecheck and `npm test` pass, and each state above is reachable by reading the component against the repository error kinds (device check in step 5).
- [x] **Step 5 - Device check** - The user runs the app on web and a tablet: end a season of a relegation league, confirm the suggestion matches the finishing order, change a selection, save, reload and confirm the plan persisted, confirm the card is absent for a non-relegation league and for an active season, confirm teams and rosters are unchanged, delete the league and confirm no leftover data. *Done when:* the user confirms, or any difference is fixed or recorded here. Result: confirmed on web and tablet; a duplicate React key between the Season and Offseason cards (both keyed by season id) was found and fixed.

## Files / areas

- New: `src/offseason/rating-adjust.ts`, `src/offseason/offseason-plan.ts`, `src/offseason/offseason-plan-repository.ts`, `src/offseason/use-offseason-plan.ts` (each logic file with a `.test.ts`), `src/components/offseason/offseason-card.tsx`.
- Changed: `src/components/leagues/league-detail.tsx` (render the card), `src/leagues/league-repository.ts` (cascade delete).
- Reuse, unchanged: `src/rules/goaltending.ts` (`addGoaltending`), `src/rules/player-generation.ts` (`controlStars`), `src/rules/test-rng.ts`, `src/seasons/season-archive-repository.ts` (`getSeasonArchive`), `acceptQueue`, `src/teams/franchise.ts`, `Button`, `ThemedText`/`ThemedView`.

## Data / contracts

- New collection `offseason-plans`, one document per season, id = `seasonId`. Additive, so no schema version bump or migration.
- `OffseasonPlan`: `{ seasonId: string; leagueId: string; promoted: string[]; demoted: string[] }`. Ids are franchise ids that appear in that season's archive; lists are disjoint and have no repeats; lengths equal `league.promotedCount` and `league.demotedCount`. Later features add fields (arrivals, new teams) additively.
- `adjustRoster` returns new player objects of the same kind, in the same order; `'promoted'`/`'demoted'` are the only movements.
- Saves go through `acceptQueue` so they cannot interleave with other season, roster or league writes. All reads fail closed: an unreadable season, archive or plan document is an error, never "none". No live franchise or roster document is written by this feature.
- Team names are user text and render as plain `ThemedText`.

## Testing

- Pure rules and validation: unit tests as listed in steps 1-2 (`npm test`).
- Repository: memory-database tests as listed in step 3.
- UI: lint and typecheck, plus the manual device check in step 5. No browser test command is configured and none is claimed.
- Run lint, `npx tsc --noEmit` and `npm test` before declaring done.

## Notes for the AI

- Read the Expo SDK 57 docs before using any Expo or React Native API not already used in `season-card.tsx`.
- Follow `season-card.tsx` and `season-archive-repository.ts` for structure, error text helpers and the hook pattern.
- Do not write to franchise or roster collections in this feature.
- Do not start dev servers; ask the user to run web and iOS checks.
- Commits carry no AI attribution (AGENTS.md rule).

## Open questions

Reversible interpretations, built as stated; tell me if either is wrong:

1. New-team grade rolls are keyed on the **departing team's movement** (the vacancy), as the spec is written: replacing a demoted team rolls C/D/F, replacing a promoted team rolls A/B/C.
2. The raise cap rule where a raise would still push OF+DE above 8 (for example 4/4 or 5/3): this spec leaves the player unchanged.

Resolved with the user: a team moving **up** (promoted) has its ratings reduced for the tougher league; a team moving **down** (demoted) has its ratings raised for the weaker league.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":11483,"specSha256":"21fafa3f203f06d4ea42126a89d38efb782bcc1aa450705545556caba7b8a2e1","branch":"refs/heads/feature/offseason-plan-and-rating-rules","head":"df0dac51eec1a762018cc6ba81d0533b605c143e","baseRef":"refs/heads/main","baseCommit":"df0dac51eec1a762018cc6ba81d0533b605c143e","sourceTree":"519178a477ffea68f16053bb94c495ce7f0f23d3","landing":"local-merge","absentOptional":[]} -->
