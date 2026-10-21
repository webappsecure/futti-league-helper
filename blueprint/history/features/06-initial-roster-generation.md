# Feature: Initial roster generation

**From build-plan:** feature 6
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/initial-roster-generation`

## Goal

Generate each team's first roster from the charts: 6 standard players and 2 goaltenders, each with a random last name, with every dice result shown beside the value it produced. The commissioner can reroll a single player, a whole team, or the whole league until happy. Nothing is locked here; accepting the league and locking rerolls is feature 7.

## In scope

- Pure roster model and generation built on the existing `src/rules/player-generation.ts` (grade comes from `Franchise.initialGrade`, RNG is injected).
- Random last names at generation and on every reroll, using `NAME_POOL`, `pickRandomName` and `getBurnedNames` from `src/names/`. A name is unavailable when it is burned or already on any stored roster in any league (rosters are unaccepted, so they are not yet burned). No two players in the same generation or reroll batch share a name.
- Persistence: one roster document per team.
- Repository operations: generate rosters for the teams in a league that have none, reroll one player, reroll one team, reroll every team in a league. Each is a single atomic batch.
- Deleting a team deletes its roster; deleting a league deletes its teams' rosters. Both in the same batch as the existing deletes.
- UI inside the existing league detail screen: a league-level "Generate rosters" button and "Reroll all rosters" button (with confirmation), and a roster view per team with the 8 players, dice results, and player and team reroll buttons.
- States: loading, empty (no roster yet), error with retry, busy (buttons disabled during a write), and per-action failure message.

## Out of scope

- Accept league, locked rerolls, season creation (feature 7).
- Manual name override, duplicate check on typed names, burning names (feature 8b). `NameRegistry` is only read here, never written.
- Offseason generation, draft players, promoted/demoted team adjustments (features 11 to 13).
- Per-value rerolls (not allowed by the product), export/import, printable cards.
- Hiding or changing the initial grade display (a later season-aware UI change).
- Editing the plan: 8b's plan line mentions wiring random names into rerolls. Feature 6 does that part because rosters need names to be usable, so 8b should be trimmed when it is specced.

## Build loop

Per `workflow.stepReview: "feature"`: build every step in order without pausing for per-step review, running `npm test`, `npx tsc --noEmit` and `npm run lint` at the end of each step. Review once when all steps are done. `workflow.checkpointCommits` is disabled; `/complete` creates the only commit.

## Build steps

- [x] **1. Roster model and pure generation.** Add `src/rosters/roster.ts` with the types below, `isRoster` (validates persisted shape: 6 standard then 2 goalie players, ids unique, ratings in range, goaltending valid via `isValidGoaltending`, name already normalized), `generateRoster(grade, rng, pickName)` and `rerollPlayer(roster, playerId, grade, rng, pickName)`. `pickName` is injected so tests are deterministic. Roll order per player: name first, then the existing rating roll order. Done when: `src/rosters/roster.test.ts` passes with exact expected rolls for a fixed `rngFromDice` sequence (one standard player, one goalie), a total of 2 (no split roll, `split.roll` null), a reroll that changes only the target player, `isRoster` rejecting each malformed case, and `npm test`, `tsc`, `lint` green.
- [x] **2. Roster repository and cascades.** Add `src/rosters/roster-repository.ts` with `ROSTER_COLLECTION = 'rosters'`, `listRosters(db, league)` (returns `{ rosters, unreadable }` like `listFranchises`), `generateLeagueRosters`, `rerollPlayer`, `rerollTeam`, `rerollLeague`. Each reads burned names and all stored roster names once, picks names sequentially (adding each new name to the unavailable set), and writes one batch. Result type follows the `FranchiseResult` shape with errors `no-teams`, `not-found`, `no-names` (pool exhausted), `storage`. Change `deleteFranchise` and `deleteLeague` to also delete the roster documents. Done when: repository tests on `createMemoryDatabase` cover generate only for teams without a roster (existing roster untouched), uniqueness across two leagues and against burned names, reroll of a player/team/league replacing only the intended documents, a damaged burned-name registry returning a storage error with nothing written, pool exhaustion returning `no-names` with nothing written, and delete team/league removing the rosters; existing franchise and league repository tests still pass; `npm test`, `tsc`, `lint` green.
- [x] **3. Hook and roster view.** Add `src/rosters/use-rosters.ts` (same load/refresh/retry shape as `use-franchises.ts`, using `createLatestOnly`). Add `src/components/rosters/roster-view.tsx` showing the team's identity header colors, 6 player cards (name, age, OF, DE, SP, control stars) and 2 goaltender cards (name, age, GO, SP), each value with its dice roll (for example "Age 25 (rolled 7)", "split rolled 4", or no roll text when none was needed), plus per-player "Reroll" and a team "Reroll team". Stars render as ★ with an accessible label like "2 control stars". Names render as plain text. Done when: `tsc` and `lint` green and the component is exercised by the step 4 screen.
- [x] **4. Wire into the league screen.** In `TeamsSection` add a "Roster" button per team card that opens the roster view (mode `roster`, with Back to the list), a league-level "Generate rosters" button (enabled when at least one team lacks a roster and the teams list is ready) and "Reroll all rosters" with an inline confirmation ("Replace every roster in this league? Current values are discarded."). Show a "Roster generated" / "No roster yet" line on each team card. Surface failures with `accessibilityRole="alert"`; disable actions while busy. Done when: `npm test`, `tsc`, `lint` green, and a manual walk-through (or browser check when available) shows generate, player reroll, team reroll, league reroll with confirmation, reload keeping the same roster, and deleting a team removing its roster. Report which of these were actually observed.

## Files / areas

New: `src/rosters/roster.ts`, `roster.test.ts`, `roster-repository.ts`, `roster-repository.test.ts`, `use-rosters.ts`; `src/components/rosters/roster-view.tsx`.
Changed: `src/teams/franchise-repository.ts` (`deleteFranchise`), `src/leagues/league-repository.ts` (`deleteLeague`), their tests, `src/components/teams/team-list.tsx`, `src/components/leagues/league-detail.tsx` only if state needs lifting.
Reused unchanged: `src/rules/player-generation.ts`, `src/rules/charts.ts`, `src/names/*`, `src/storage/*`, `src/leagues/ids.ts`, `src/components/button.tsx`.

## Data / contracts

Collection `rosters`, document id = franchise id. No migration: the collection is new and absent documents mean "no roster yet".

```ts
interface Roster {
  franchiseId: string;      // equals the document id
  leagueId: string;
  players: RosterPlayer[];  // exactly 6 standard then 2 goalie
}
type RosterPlayer = StandardRosterPlayer | GoalieRosterPlayer;
interface StandardRosterPlayer {
  id: string;               // createId(); stable across rerolls of other players, new on reroll of this one
  kind: 'standard';
  name: string;             // normalized uppercase last name
  age: number; offense: number; defense: number; sportsmanship: number;
  controlStars: 0 | 1 | 2;
  rolls: { age: number; total: number; split: number | null; stars: number; sportsmanship: number };
}
interface GoalieRosterPlayer {
  id: string; kind: 'goalie'; name: string;
  age: number; goaltending: number; sportsmanship: number;
  rolls: { age: number; goaltending: number; sportsmanship: number };
}
```

- Rolls are stored so the dice display survives a reload. Names are not rolled, so they have no roll entry.
- Offense plus defense equals the rolled total (max 8). Ages 20 to 30, goaltending valid per `isValidGoaltending`, sportsmanship 1 to 5.
- Reroll keeps the player's slot (position in `players`) and replaces the whole player including a new id and new name.
- Grade used is the team's current `initialGrade` at the time of the roll. Editing a grade later does not change an existing roster.
- Rerolls and generation are read-modify-write on the local single-user database; the UI disables actions while one is in flight, so no extra locking.
- Result shape: `{ ok: true, value } | { ok: false, error: { kind: 'no-teams' | 'not-found' | 'no-names' } | { kind: 'storage', error: Error } }`.

## Testing

- Unit tests (jest): the roster pure functions and the repository on the memory database, as listed per step. Use `rngFromDice` and an injected `pickName`/seeded RNG for exact expectations.
- Existing 278 tests must keep passing.
- UI is not unit tested (project testing standard); it is checked by hand through step 4's walk-through. No live, visual or persisted-device evidence is claimed unless actually run.

## Notes for the AI

- Verify baseline observed at spec time: `tsc` clean, `lint` clean, 21 suites / 278 tests passing.
- Before writing any Expo or React Native API usage, check the SDK 57 docs as AGENTS.md requires; this feature should need only components already used in the repo.
- Do not start a dev server to poll it; ask the user if a live check is wanted.
- Keep `NAME_POOL` access through `src/names/name-pool.ts`; do not copy the list.
- Do not add AI attribution to commits.

## Open questions

None blocking. Decisions made without asking (reversible, change on review if wrong):
- Random names are generated now (not left to 8b) because a roster without names is unusable and the product says rerolls also reroll names.
- Generation is allowed for any number of teams in a league, not only a full league.
- "Reroll all rosters" asks for confirmation; player and team rerolls do not.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":9979,"specSha256":"4515527518bc461d999ee980db8419e3fbb4e14f612081f91ccccdfc7b603ee9","branch":"refs/heads/feature/initial-roster-generation","head":"f90fb95005b60ba4f22089c30cfd6b61b63f98fa","baseRef":"refs/heads/main","baseCommit":"f90fb95005b60ba4f22089c30cfd6b61b63f98fa","sourceTree":"b7cd073001842accc14d546cefb32690e2bbf5d8","landing":"local-merge","absentOptional":[]} -->
