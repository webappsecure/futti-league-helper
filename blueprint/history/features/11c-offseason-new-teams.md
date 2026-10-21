# Feature: Offseason: new teams

**From build-plan:** feature 11c
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/offseason-new-teams`

## Goal

Let the commissioner fill the vacancies that linked leagues do not fill with newly created teams. For each new team the commissioner enters the city, name and colors; the app rolls the replacement grade, generates a roster of 6 players and 2 goaltenders from that grade (dice shown), and saves the team in the league's staged offseason plan. Live teams, rosters and the name registry are untouched until feature 13 approves the offseason.

The build plan was split with the user: 11c is new teams only. Former teams moved to a new item 11d after feature 13, because teams with no league only exist once 13 applies an offseason.

## Decisions (from the user and the plans)

- **Vacancies come from the departures and the links.** A promoted team leaves upward and a demoted team leaves downward. A linked league fills the place through 11b arrivals. A direction with no linked league leaves its places open for new teams. So open promoted-side places = number of promoted teams when there is no league above, else 0; open demoted-side places = number of demoted teams when there is no league below, else 0. The link rules guarantee arrivals equal departures on a linked side, so this needs no neighbor data.
- **Teams that leave with no linked league** stay as franchises with no league once the offseason is applied (feature 13 defines this); 11d will let them return as former teams.
- **Grade roll** follows the departing team's movement, as confirmed in 11a: a team replacing a demoted team rolls C/D/F, one replacing a promoted team rolls A/B/C (`replacementGrade`). The commissioner does not choose the grade.
- **The commissioner enters** city, team name and primary and secondary colors, the same fields and limits as the existing team form.
- **Roster** is generated with the existing initial-roster rules from the rolled grade; players get new random last names that are not burned and not already used by another staged new team.

## In scope

- `newTeams` on `OffseasonPlan`: staged new teams with identity, vacancy side, rolled grade and roll, generated roster, and a stable franchise id.
- Pure helpers: open vacancies, new-team build (grade roll plus roster), and a check that staged new teams still fit the vacancies.
- Repository operations to add, reroll (grade and roster, identity kept) and remove a staged new team.
- A "New teams" section in the Offseason card with loading, empty, form, invalid, error, staged and over-capacity states.

## Out of scope

- Former teams and any unassigned-team pool (11d, after 13).
- Applying anything to live data, creating franchises or rosters, burning names, setting identity `fromSeason`, creating season N+1, approval (13).
- Editing a staged team's identity (remove it and add it again), per-player rerolls or name overrides.
- Protection, aging, free agency, draft, progression (12, 13).

## Build loop

Build one small step at a time. `workflow.stepReview` is `feature`: one review packet after all steps. `workflow.checkpointCommits` is disabled. `/complete` makes the final feature commit.

## Build steps

- [x] **Step 1 - Model and pure helpers** - In `src/teams/franchise.ts` extract the city, name and color checks of `validateFranchiseInput` into an exported `validateIdentityInput(input)` (same messages and limits; returns the cleaned `{ city, name, primaryColor, secondaryColor }` or the field errors) and have `validateFranchiseInput` call it, with no behavior change. In `src/offseason/offseason-plan.ts` add `StagedNewTeam { id, vacancy: 'promoted' | 'demoted', gradeRoll, grade, city, name, primaryColor, secondaryColor, players: RosterPlayer[] }` and an optional `newTeams?: StagedNewTeam[]` on `OffseasonPlan`; extend `isOffseasonPlan` (non-empty id, known vacancy, roll 1-6 that matches `replacementGrade(vacancy, roll) === grade`, valid cleaned identity text and colors, `players` accepted by `isRoster`, ids unique and distinct from arrival franchise ids). Add `src/offseason/new-teams.ts` with: `openVacancies(plan, { hasAbove, hasBelow })` returning `{ promoted, demoted }` counts left after existing staged new teams (promoted side is `plan.promoted.length` when `!hasAbove` else 0; demoted side is `plan.demoted.length` when `!hasBelow` else 0; never below 0); `buildNewTeam({ id, vacancy, identity, leagueId, rng, pickName })` which rolls a d6, maps it with `replacementGrade`, and calls `generateRoster(id, leagueId, grade, rng, pickName)`; `newTeamsFit(plan, links)` true when staged counts per side do not exceed the capacity before staging. *Done when:* unit tests cover `validateIdentityInput` (every field error, trimming, hex normalizing) and that `validateFranchiseInput` still passes its existing tests; vacancies for no links, above only, below only, both, with 0 promoted or 0 demoted, and with some already staged; `buildNewTeam` for each grade-roll band on both sides with `rngFromDice` (grade, roll, 8 players, first-roll values); `newTeamsFit`; and `isOffseasonPlan` with valid and each invalid new-team case; `npm test` passes.
- [x] **Step 2 - Repository: add, reroll, remove** - Export `namePicker` from `src/rosters/roster-repository.ts` (currently private) and add to `src/offseason/offseason-plan-repository.ts`: `addNewTeam(db, league, input, vacancy, options?)`, `rerollNewTeam(db, league, teamId, options?)` and `removeNewTeam(db, league, teamId)`, all through `acceptQueue` and each writing one `put` of this league's plan; `options` is `{ rng?, newId?, pool? }` for tests (defaults `Math.random`, `createId`, `NAME_POOL`). Each requires this league's season in `offseason` and its own saved plan (errors `no-season`, `not-offseason`, `no-plan`). `addNewTeam` validates the identity with `validateIdentityInput`, requires an open place on the chosen side from `openVacancies` using `leagueAbove`/`leagueBelow` of the current league record (error `no-vacancy`), checks the team name is not used by any franchise in the league's linked chain (compared case-insensitively against the identity in effect for the season, using the same chain rule as team creation) or by any staged new team in the plans of those leagues (field error on `name`, like the existing duplicate text), picks player names that avoid the burned registry and the names on every staged new team in every offseason plan, then appends the built team. `rerollNewTeam` redoes the grade roll and roster for an existing staged team keeping its id, side and identity, excluding that team's own current names from the unavailable set; `removeNewTeam` removes it (error `not-found` when the id is not staged). Pool exhaustion returns `no-names`. All reads fail closed (an unreadable plan, league, franchise or registry document is a `storage` error). Result and error shapes follow `PlanResult`, with text added to `planErrorText`. *Done when:* memory-database tests cover: add on the lower (no league below) and upper leagues, two sides in one unlinked league, `no-vacancy` when both sides are full or the side is linked, duplicate name against a live team, a linked-chain team and another staged team, invalid identity fields, names never burned and never repeated across staged teams or leagues, reroll keeps id and identity while the roster changes, remove, errors for no plan, not offseason and unknown id, saving departures and staging arrivals both keep `newTeams`, a failed batch leaves the old plan, and pool exhaustion; `npm test` passes.
- [x] **Step 3 - New teams section in the Offseason card** - Extend `getArrivalStatus`'s result (or add a small sibling read in the same repository file) with `hasAbove` and `hasBelow` so the UI can call `openVacancies`. Add `src/components/offseason/new-teams-section.tsx`, rendered below Arrivals in `offseason-card.tsx`. It shows the open places by side in plain words ("1 place replacing a promoted team, 2 replacing demoted teams"), and "No open places" when none. With an open place and a saved plan it shows a form (city, team name, `ColorPicker` for both colors, same limits and placeholders as `team-form.tsx`, with a choice of side only when both sides are open) and an "Add team" button; field errors render under the field with `accessibilityRole="alert"`; a successful add clears the form and shows the team. Each staged team shows its identity, side, the grade with its d6 roll ("Rolled 3: grade D"), and its 8 players through the existing `playerLine` helper, with "Reroll team" and "Remove" buttons. When staged teams exceed the open capacity (links changed) it shows a warning to remove extras. Buttons disable while a write runs, the save-first hint shows until the departures plan is saved, and all errors use the existing error text style. Team and player names render as plain text. The card refreshes after every change. *Done when:* lint, typecheck and `npm test` pass, and each state above is reachable by reading the component against the repository results (device check in step 4).
- [x] **Step 4 - Device check** - The user runs the app on web and a tablet: with an unlinked relegation league (and again with a linked pair) end the season and save the departures; confirm open places match the unlinked sides only; add a new team for each open place and confirm the rolled grade falls in the right band, the roster shows 8 players with names not used elsewhere, and a duplicate team name is refused; reroll a team and confirm the grade and players can change while the identity stays; remove a team and add it again; reload and confirm everything persisted; confirm live teams, rosters and the burned names are unchanged; delete the league and confirm nothing is left over. *Done when:* the user confirms, or any difference is fixed or recorded here. Result: confirmed by the user on web and tablet.

## Files / areas

- New: `src/offseason/new-teams.ts` (+ test), `src/components/offseason/new-teams-section.tsx`.
- Changed: `src/teams/franchise.ts` (+ test), `src/offseason/offseason-plan.ts` (+ test), `src/offseason/offseason-plan-repository.ts` (+ test), `src/rosters/roster-repository.ts` (export `namePicker`), `src/components/offseason/offseason-card.tsx`.
- Reuse, unchanged: `src/offseason/rating-adjust.ts` (`replacementGrade`), `src/rosters/roster.ts` (`generateRoster`, `isRoster`), `src/names/name-pool.ts`, `src/names/name-registry.ts` (`getBurnedNames`), `src/leagues/league-links.ts`, `src/leagues/ids.ts` (`createId`), `ColorPicker`, `Button`, `playerLine`, `acceptQueue`.

## Data / contracts

- No new collection. `offseason-plans` documents gain an optional `newTeams` array; an old document without it stays valid, so no migration or version bump.
- `StagedNewTeam`: `{ id: string; vacancy: 'promoted' | 'demoted'; gradeRoll: number (1-6); grade: Grade; city: string; name: string; primaryColor: string; secondaryColor: string; players: RosterPlayer[] }`. `id` is a generated franchise id that feature 13 will reuse when it creates the franchise; unique within the league's plan and not equal to any staged arrival's franchise id. `city`, `name`, `primaryColor` and `secondaryColor` are the cleaned values from `validateIdentityInput` (trimmed, 1-60 characters for text, lowercase `#rrggbb` colors). `players` is 6 standard players followed by 2 goaltenders, with the dice rolls kept; the roster's `leagueId` for validation is the owning league's id.
- `grade` must equal `replacementGrade(vacancy, gradeRoll)`.
- Name rules: a staged player name is not in the burned registry and not on any other staged new team in any offseason plan. Names are not burned here; feature 13 burns them at approval.
- Team name rules: unique case-insensitively among the linked chain's franchises (identity in effect for the season) and the staged new teams in the chain's plans. City names may repeat.
- Writes: one `put` of this league's plan per operation, through `acceptQueue`. Reads fail closed. No franchise, roster or registry document is written.
- Randomness: `rng`, `newId` and `pool` are injectable so tests are exact.
- Team and player names are user or list text and render as plain `ThemedText`; inputs have accessibility labels like the existing team form.

## Testing

- Pure helpers, validation and plan validation: unit tests as in step 1.
- Repository: memory-database tests as in step 2.
- UI: lint and typecheck plus the manual device check in step 4. No browser test command is configured and none is claimed.
- Run lint, `npx tsc --noEmit` and `npm test` before declaring done (baseline: 515 tests pass).

## Notes for the AI

- Read the Expo SDK 57 docs before using any Expo or React Native API not already used in `team-form.tsx` or `offseason-card.tsx`.
- Follow `team-form.tsx` for the form, `offseason-plan-repository.ts` for results and errors, and `roster-repository.ts` for name picking.
- Do not write to franchise, roster or name-registry collections, and do not change another league's plan.
- Do not start dev servers; ask the user to run web and iOS checks.
- Commits carry no AI attribution (AGENTS.md rule).

## Open questions

Reversible choices, built as stated; tell me if any is wrong:

1. A new team is added one at a time and not forced to fill every open place; feature 13's approval will require all places filled.
2. Reroll keeps the identity and redoes both the grade roll and the roster (a new team is a package of grade and players).
3. The existing team-name uniqueness rule is applied to new teams and to staged new teams across the linked chain, using each team's identity in effect for the current season.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":13677,"specSha256":"3e575d14418d227c9df46ae3504ad893111bb5c8996c0d9ecd99fda40e1005e2","branch":"refs/heads/feature/offseason-new-teams","head":"954f74ee2c30ff168c2b8381350a2ef485915534","baseRef":"refs/heads/main","baseCommit":"954f74ee2c30ff168c2b8381350a2ef485915534","sourceTree":"c249be750ddc3dea6e25ec1fe9adab3ca24b9d46","landing":"local-merge","absentOptional":[]} -->
