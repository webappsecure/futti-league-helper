# Feature: Accept league

**From build-plan:** feature 7
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/accept-league`

## Goal

Let the commissioner review every roster in a league, accept them, and lock them. Accepting creates the league's first season (season 1, active) and freezes the rosters: no rerolls, no adding, editing or deleting teams. This is the point where generated values become permanent history.

## In scope

- A season record per league: `{ id, leagueId, index, status }`, created by accepting. Only index 1 and status `active` are produced here.
- Accept preconditions, checked in the repository (not only the UI): the league has no season yet; its team count equals `league.size`; every team has a readable roster; no team or roster document of this league is unreadable.
- Review screen inside the league detail: every team in the league with its colors, display name and all 8 players (same one-line detail format as the roster view, read-only), then an "Accept league" button that asks for confirmation ("Accept this league? Rosters are locked and become season 1. This cannot be undone.") before writing.
- Lock, enforced in the repositories: `rerollPlayer`, `rerollTeam`, `rerollLeague`, `generateLeagueRosters`, and franchise `createFranchise`, `updateFranchise`, `deleteFranchise` return a `locked` error when the league has a season. UI hides or disables those controls and shows the league as "Accepted - Season 1".
- Deleting an accepted league still works (with the existing confirmation, extended to mention the accepted season) and also deletes its season record in the same batch.
- States: loading and error-with-retry for the season lookup, busy while accepting, per-action failure message (`accessibilityRole="alert"`), incomplete-league message listing what is missing, accepted state.

## Out of scope

- Burning names on accept, manual name override: feature 8b. Accept is a single atomic batch so 8b adds its burn op to the same batch (see finding F-02 in `blueprint/context/findings.md`). Accepted rosters keep their names reserved anyway because the name picker excludes names on any stored roster.
- Season archive, finishing order, season status changes beyond `active`, per-season rosters/snapshots: feature 10.
- Editing team identity or grade after accept (offseason, features 10 and 11). Edit is locked here.
- Undo or "un-accept" of a league. Changing league settings or links on an accepted league keeps today's behavior.
- Hiding the initial grade after season 1 (see memory `project-grade-display`; belongs to feature 10+ when a season is archived).
- Export/import of the new collection (feature 9 covers all collections).

## Build loop

Per `workflow.stepReview: "feature"`: build every step in order without pausing for per-step review, running `npm test`, `npx tsc --noEmit` and `npm run lint` at the end of each step. Review once when all steps are done. `workflow.checkpointCommits` is disabled; `/complete` creates the only commit.

## Build steps

- [x] **1. Season model and repository.** Add `src/seasons/season.ts` (`SEASON_COLLECTION = 'seasons'`, `Season`, `isSeason`) and `src/seasons/season-repository.ts` with `getLeagueSeason(db, leagueId)` returning the league's season or null, and a storage error when the collection cannot be read or a season for that league is unreadable (fail closed: a lock check must never read "no season" from damaged data). Done when: `season.test.ts` and `season-repository.test.ts` on `createMemoryDatabase` cover `isSeason` rejecting each malformed field, no season returning null, one season returned, other leagues' seasons ignored, a damaged document for the league returning a storage error; `npm test`, `tsc`, `lint` green.
- [x] **2. Accept operation.** Add `src/seasons/accept-league.ts` with `acceptLeague(db, league, newId = createId)`. It reads teams (`listFranchises`), rosters (`listRosters`) and the league's season, then writes one batch containing the season put. Error kinds: `already-accepted`, `incomplete` (with `teams`, `size`), `missing-rosters` (with `count`), `unreadable` (any unreadable team or roster), `storage`. Done when: tests cover success (season id from `newId`, index 1, status `active`, one document written), each error kind writing nothing, a second accept returning `already-accepted`, and a read failure returning `storage`; `npm test`, `tsc`, `lint` green.
- [x] **3. Lock the repositories.** Add a `locked` error kind to `RosterError` and `FranchiseError`. In `roster-repository.ts` check `getLeagueSeason` first in `generateLeagueRosters`, `rerollLeague`, `rerollTeam`, `rerollPlayer` and return `locked` (a storage error from the lookup maps to `storage`). In `franchise-repository.ts` do the same in `createFranchise` and `updateFranchise`; `deleteFranchise` first reads the franchise (missing: keep today's behavior of deleting nothing and succeeding) and locks by its `leagueId`. In `league-repository.ts` `deleteLeague` also deletes the league's season documents in its batch. Update `rosterErrorText` and the team form's error handling for `locked` ("This league has been accepted. Its teams and rosters are locked."). Done when: tests show each locked operation returning `locked` with nothing written once a season exists and succeeding before, and `deleteLeague` removing the season; existing franchise, roster and league repository tests still pass; `npm test`, `tsc`, `lint` green.
- [x] **4. Hook and review screen.** Add `src/seasons/use-league-season.ts` (load/refresh/retry like `use-rosters.ts`, `createLatestOnly`). Move the player detail text and stars helpers from `roster-view.tsx` to a shared export so the review screen reuses them. Add `src/components/rosters/league-review.tsx`: all teams in display order, each with swatches, name and 8 read-only player lines (goalies marked `(G)`), a Back button, the Accept button with inline confirmation, busy state and failure alert (incomplete, missing rosters, unreadable, storage messages worded for the commissioner). Names render as plain text. Done when: `tsc` and `lint` green and the component is exercised by step 5.
- [x] **5. Wire into the league screen.** In `TeamsSection`: a "Review and accept" button (enabled when teams and rosters have loaded, and the league has no season) that opens the review as a focused mode like `roster` (hides league info via `onFocusChange`); when accepted, show "Accepted - Season 1" and hide or disable Add team, Edit, Delete, Generate rosters, Reroll all; the roster view hides per-player and team Reroll. Season lookup loading/error shows the retry card and keeps the locking controls disabled until known. Extend the league delete confirmation text with "Its accepted season is deleted too." when accepted. Done when: `npm test`, `tsc`, `lint` green, and a manual or browser walk-through shows: incomplete league cannot be accepted, full league reviews and accepts after confirmation, controls lock, reload keeps the accepted state, deleting the league removes it. Report which of these were actually observed; do not claim unrun ones.

## Files / areas

New: `src/seasons/season.ts`, `season.test.ts`, `season-repository.ts`, `season-repository.test.ts`, `accept-league.ts`, `accept-league.test.ts`, `use-league-season.ts`; `src/components/rosters/league-review.tsx`.
Changed: `src/rosters/roster-repository.ts` (+ test), `src/teams/franchise-repository.ts` (+ test), `src/leagues/league-repository.ts` (+ test), `src/components/rosters/roster-view.tsx`, `src/components/teams/team-list.tsx`, `src/components/teams/team-form.tsx` (locked message), `src/components/leagues/league-detail.tsx` (delete text, season state).
Reused unchanged: `src/storage/*`, `src/leagues/ids.ts`, `src/leagues/latest-only.ts`, `src/components/button.tsx`, `src/names/*`.

## Data / contracts

Collection `seasons`, document id = season id (`createId()`). No migration: the collection is new and absent means "not accepted".

```ts
interface Season {
  id: string;
  leagueId: string;
  index: number;                                     // 1 here; later seasons increment (feature 10)
  status: 'setup' | 'active' | 'offseason' | 'archived'; // only 'active' is written here
}
```

- At most one season per league in this feature; `acceptLeague` enforces it by reading first. Feature 10 owns multi-season rules.
- Accepted = the league has a season document. Rosters stay in the `rosters` collection unchanged (one document per team); feature 10 adds season snapshots.
- Accept result: `{ ok: true, value: Season } | { ok: false, error: { kind: 'already-accepted' } | { kind: 'incomplete', teams: number, size: number } | { kind: 'missing-rosters', count: number } | { kind: 'unreadable' } | { kind: 'storage', error: Error } }`.
- Locked operations return `{ kind: 'locked' }` before any write. Lock lookup failures return `storage`, never "unlocked".
- Accept is read-then-write on a single-user local database; the UI disables the button while the write is in flight, so no extra locking. 8b adds the burned-name op to this same batch, built from the registry read in the same operation (F-02).

## Testing

- Unit tests (jest-expo, `createMemoryDatabase`, injected ids) as listed per step; all repository and pure logic stays UI-free.
- `npm test`, `npx tsc --noEmit`, `npm run lint` at the end of each step. No combined Verify command or browser-test command exists in `AGENTS.md`, so none is claimed.
- UI is checked by hand per step 5; record exactly what was observed.

## Notes for the AI

- Read the Expo SDK 57 docs before touching any Expo or React Native API (none are expected; the work reuses existing components).
- Follow the existing `Result` pattern (`{ ok, value } | { ok: false, error }`), the `done`/`fail`/`storage` helper style, and `ThemedView`/`ThemedText`/`Button` components.
- Assumptions made without a product statement, to confirm at spec review: (a) accept requires the league to be full (team count equals size) and every team to have a roster; (b) accepting locks Edit as well as Add/Delete of teams; (c) burning names is left to 8b as the build plan says, even though earlier notes mentioned burning at accept.
- Do not add a dependency. Do not touch `ios/` or `android/`.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":10266,"specSha256":"772bc1c213485415c16c1daa1110492f93f72ff77e02164c545c4c3b6b350977","branch":"refs/heads/feature/accept-league","head":"acdc076db02c068d6f97754afb07772b54dce366","baseRef":"refs/heads/main","baseCommit":"acdc076db02c068d6f97754afb07772b54dce366","sourceTree":"d843bc71cc7722ed486bbbf7efc0fbe519dfb446","landing":"local-merge","absentOptional":[]} -->
