# Feature: Season archive and finishing order

**From build-plan:** feature 10
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/season-archive-and-finishing-order`

## Goal

Let the commissioner end an accepted league's current season by entering the final finishing order by hand. Ending the season saves a frozen historical snapshot (each team's identity, finishing position and full roster for that season) and moves the season to `offseason`, ready for features 11-13. The order can be corrected afterwards while the season is still in `offseason`.

## Decisions (confirmed with the user)

- **No ties.** Positions are a strict order 1..N, one team per position.
- **Ending the season** writes the snapshot and sets the season's status `active` -> `offseason` in one atomic batch. `archived` is not set here; a later offseason feature sets it when the next season starts.
- **Correctable** while the season is `offseason`: only the positions change (the saved rosters and identities stay as first captured).

## In scope

- A `SeasonArchive` document per ended season (see Data / contracts) and a pure builder that makes it from the season, franchises and rosters.
- `finishSeason` (active -> offseason with the snapshot) and `updateFinishingOrder` (correct positions in `offseason`), both serialized with the existing `acceptQueue` and failing closed on unreadable data.
- A repository read for a season's archive (`getSeasonArchive`) and a hook for the screen.
- A "Season" card in the league detail screen, shown for accepted leagues: current season number and status; while `active`, an ordered team list with move up/down buttons and an "End season" button behind a confirmation; while `offseason`, the saved finishing order with an "Edit finishing order" action using the same list and a "Save order" button.
- Cascade: deleting a league also deletes its archive.
- Loading, empty (no teams), error (read/write failure, unreadable data, wrong status) and success states, announced and labelled for accessibility.

## Out of scope

- Creating season 2, offseason steps, promotion/relegation, aging, drafts (features 11-13).
- Browsing archived history (feature 14) beyond showing the saved order on this card.
- Setting the season to `archived`, un-ending a season, or re-taking the snapshot.
- Showing or hiding the team's initial grade.
- Export/import of the archive (feature 9, built last, will pick it up as ordinary stored data).
- Support for several seasons per league in `getLeagueSeason` (it still returns the league's only season; the first offseason feature that adds season 2 must replace it).

## Build loop

Build one small step at a time. `workflow.stepReview` is `feature`: produce one review packet after all steps. `workflow.checkpointCommits` is disabled. `/complete` makes the final feature commit.

## Build steps

- [x] **Step 1 - Archive model and builder** - Add `src/seasons/season-archive.ts` with the `SeasonArchive` type, `SEASON_ARCHIVE_COLLECTION`, `isSeasonArchive`, and a pure `buildSeasonArchive({ season, franchises, rosters, order })`. `order` is the franchise ids best-to-worst. It returns an error (not a partial archive) when `order` is not exactly the franchise ids with no repeats, a franchise has no roster, or a franchise has no identity for `season.index` (`identityForSeason`). Players are deep-copied (`structuredClone` or a JSON copy) so later roster edits cannot change the snapshot. Add `reorderTeams(order, from, to)` (pure move up/down helper) and `applyFinishingOrder(archive, order)` (updates positions only, same validation). *Done when:* unit tests cover a valid build, duplicate/missing/extra ids, missing roster, missing identity, snapshot independence from later edits, move helpers at both ends, and `isSeasonArchive` accept/reject; `npm test` passes for them.
- [x] **Step 2 - Repository operations** - Add `src/seasons/season-archive-repository.ts`: `getSeasonArchive(db, seasonId)` (fails closed on an unreadable document), `finishSeason(db, league, order)` and `updateFinishingOrder(db, league, order)`, both wrapped in `acceptQueue`. `finishSeason` requires the league's season to exist and be `active` (error `not-active` otherwise, including already `offseason`), reads franchises and rosters via `listFranchises`/`listRosters`, refuses when anything is `unreadable` or the team count differs from `league.size`, then writes the season with status `offseason` and the archive in one `db.batch`. `updateFinishingOrder` requires status `offseason` and an existing archive, and writes only the archive. Error shape: `{ kind: 'no-season' | 'not-active' | 'not-offseason' | 'incomplete' | 'unreadable' | 'invalid-order' | 'no-archive' | 'storage' }` with a text helper like `acceptErrorText`. Add the archive delete to `deleteLeagueNow` in `src/leagues/league-repository.ts` (same batch as the season delete). *Done when:* tests on the memory database cover: finish happy path (season is `offseason`, archive has N unique positions and cloned rosters), second finish rejected with no change, wrong order rejected with no write, unreadable team/roster document rejected, incomplete league rejected, update allowed only in `offseason`, a failed batch leaves both documents unchanged, and deleting a league removes its archive; `npm test` passes.
- [x] **Step 3 - Hook and Season card** - Add `useSeasonArchive` (loading/error/ready, with `refresh`/`retry`, latest-only like `useLeagueSeason`) and a `SeasonCard` component in `src/components/seasons/` used from `league-detail.tsx` for accepted leagues. Team labels use `displayName(identityForSeason(...), league.namingStyle)`. Active: ordered list (initial order = the order teams are listed) where a team row is dragged to its position (mouse on web, touch on tablet), then "End season" -> inline confirmation ("This ends season N and saves a snapshot of every roster. You can still correct the finishing order afterwards.") with Confirm/Cancel. Offseason: saved order with "Edit finishing order" -> same list pre-filled with "Save order"/"Cancel". Revision (user request): reordering is drag and drop, not buttons. Fixed-height rows; the dragged row follows the pointer, the other rows slide to show where it will land, and the order is applied on release through `reorderTeams`; a pure `dropIndex(from, translationY, rowHeight, count)` computes the target and is unit tested. Built with the already installed `react-native-gesture-handler` (Pan on a `GestureDetector`, root view already in `src/app/_layout.tsx`) and `react-native-reanimated`; no new dependency. On touch the drag starts after a short press-and-hold so the page can still scroll; on web it starts on pointer movement. Each row exposes `accessibilityActions` (move up / move down) so screen readers keep a non-drag way to reorder. Errors render as plain text with `accessibilityRole="alert"`; buttons disable while a write runs; the card refreshes the season and archive after success. Teams and rosters stay locked as before. *Done when:* lint, typecheck and `npm test` pass, and each state above is reachable by reading the component against the repository error kinds (device check in step 4).
- [x] **Step 4 - Device check** - The user runs the app on web and a tablet: end a season for an accepted league, confirm the saved order and that team/roster editing stays locked, correct the order, reload and confirm it persisted, delete the league and confirm no leftover data. *Done when:* the user confirms, or any difference is fixed or recorded here.

## Files / areas

- New: `src/seasons/season-archive.ts` (+ test), `src/seasons/season-archive-repository.ts` (+ test), `src/seasons/use-season-archive.ts`, `src/components/seasons/season-card.tsx`.
- Changed: `src/components/leagues/league-detail.tsx` (render the card), `src/leagues/league-repository.ts` (cascade delete).
- Reuse, unchanged: `src/seasons/season.ts`, `accept-queue.ts`, `season-repository.ts`, `src/teams/franchise.ts` (`identityForSeason`, `displayName`), `listFranchises`, `listRosters`, `Button`, `ThemedText`/`ThemedView`.

## Data / contracts

- New collection `season-archives`, one document per season, document id = `seasonId`. Additive, so no schema version bump or migration step.
- `SeasonArchive`: `{ seasonId: string; leagueId: string; seasonIndex: number; teams: ArchivedTeam[] }`, `teams` sorted by `position`.
- `ArchivedTeam`: `{ franchiseId: string; position: number; identity: FranchiseIdentity; initialGrade: Grade; players: RosterPlayer[] }`. `position` is an integer 1..N, unique, and equals the team's index in the submitted order + 1. `identity` is the one in effect for `seasonIndex`; `players` is a deep copy of the roster when the season ended.
- Season status transition added here: `active` -> `offseason` only, together with the archive in one `db.batch` (all or nothing). The season document keeps its other fields.
- Every write goes through `acceptQueue` so it cannot interleave with accept, roster/team writes or league delete. All reads fail closed: an unreadable season, team, roster or archive document is an error, never "none".
- Team names are user text and render as plain `ThemedText`.
- No network, auth or secrets are involved.

## Testing

- Unit (jest, memory database): steps 1 and 2 as listed. UI is not unit tested (project convention); no browser test command exists.
- Gate: `npm test`, `npm run lint`, `npx tsc --noEmit` (baseline before this work: 427 tests pass, lint and typecheck clean).
- Manual: step 4.

## Notes for the AI

- Expo SDK 57: this feature uses no new Expo packages. Follow the existing patterns in `accept-league.ts` (result shapes, `acceptQueue`, `db.batch`) and `use-league-season.ts` (latest-only hook).
- `getLeagueSeason` returns the first season stored for a league; keep using it and do not generalize it here.
- Keep `Season.index` as the season number shown to users (1-based).
- Match the card styling and error text conventions in `league-detail.tsx`; reordering is drag and drop using the installed gesture-handler and reanimated (no new dependency); keep the row fixed-height and call `reorderTeams` on release.
- Do not add AI attribution to commits.

## Verification

- `npm test` (456 passed), `npx tsc --noEmit` and `npm run lint` clean.
- Device check (step 4): the user confirmed on a tablet and on web that ending a season, drag-and-drop ordering, editing the order and the rest of the flow work.
- Revision during the build (user request): reordering uses drag and drop (gesture-handler + reanimated, already installed) instead of up/down buttons; rows expose move up/down accessibility actions on native. No keyboard reorder on web.
