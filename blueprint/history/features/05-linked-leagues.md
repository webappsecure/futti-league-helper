# Feature: Linked leagues

**From build-plan:** feature 5
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/linked-leagues`

## Goal

Let the commissioner link one league above and one league below another, so a promotion and relegation ladder exists. A link is only allowed when the two leagues agree: same naming style, and the number of teams the upper league demotes equals the number the lower league promotes. Team names must be unique across every league in a linked chain. Everything stays in the leagues screen; promotion and relegation itself is feature 11.

## In scope

- `League` gains optional `leagueAboveId` and `leagueBelowId` (non-empty strings). Existing documents stay valid with no migration. `isLeague` accepts them only as non-empty strings.
- Link direction: in a link, the upper league sends demoted teams down to the lower league and receives its promoted teams. **Counts match when `upper.demotedCount === lower.promotedCount`.** Both leagues must have relegation on, and both must have the same `namingStyle`.
- Each league has at most one league above and one below. A league cannot link to itself, and a link cannot close a loop. Chains of three or more are allowed by the model: the middle league holds both ids, and the UI shows each league's direct neighbors only.
- Link rules live in pure functions: `linkProblem(upper, lower, leagues)` returns a plain-words reason or `null`; `chainLeagueIds(league, leagues)` returns the ids of every league connected to it, tolerating bad data (visited set) so a corrupt loop cannot hang.
- A link is stored on both leagues and written in one `db.batch`, so the two sides cannot disagree. Unlinking clears both sides in one batch. A link whose other league is missing or unreadable counts as no link in the UI and in the slot checks, so it can be replaced.
- Link time also checks team names across the two chains being joined: trimmed, case-insensitive, same comparison as `findDuplicateName` (the season 1 identity name). A collision refuses the link and names the clashing team name.
- Team name uniqueness now covers the whole linked chain: `createFranchise` and `updateFranchise` refuse a name already used by a team in any league of the chain. Message for a linked league: "A team with this name already exists in this league or a linked league." An unlinked league keeps the existing message.
- Editing a linked league keeps the link valid. `updateLeague` preserves the existing link ids (they are not form fields) and rejects an edit that would break a link: changing `namingStyle`, turning relegation off, or changing a count so it no longer equals the neighbor's. The field error says to unlink first. Size edits are unaffected.
- Deleting a league removes its link from each neighbor in the same batch as the league and team deletion. The delete confirmation text mentions the unlink when the league is linked.
- League details pane: a "Linked leagues" section showing the league above and below (names, or "None"), a Link button for each empty slot, and an Unlink button for each filled slot (no confirmation; relinking is one step).
- Link picker (inline, in the details pane): lists the other leagues. A league that fails `linkProblem` is shown disabled with its reason. Choosing an eligible league links it. A refusal from the repository (name collision, storage error, league changed or gone) shows inline with an alert role and leaves the picker open. Empty state when there are no other leagues. Link and Unlink show a pending state and disable repeat presses.
- Unit tests for the pure rules and the repository changes.

## Out of scope

- Moving teams between leagues, choosing departing teams, grade rolls (feature 11).
- Divisions and conferences (later).
- Editing counts or naming style across a link without unlinking first.
- Showing a whole chain as a diagram; checking that an unlinked league's non-zero counts are satisfiable (an unlinked league keeps whatever counts it was saved with).
- Export/import of links (feature 9 serializes the stored documents as they are).

## Build loop

Steps are reviewed one at a time (`workflow.stepReview`: `feature`; no checkpoint commits). Build a step, run its checks, tick it, and pause for review before the next. `/complete` makes the single feature commit.

## Build steps

- [x] **Step 1 - Link model and pure rules.** In `src/leagues/league.ts` add the two optional fields, export `LEAGUE_COLLECTION = 'leagues'` (used by `league-repository.ts` instead of its private constant), and extend `isLeague`. Create `src/leagues/league-links.ts` with `linkProblem`, `chainLeagueIds`, and `linkedEditProblems(updated, above, below)` returning `FieldErrors` for a league edit (naming style, relegation, counts). `linkProblem` reasons, checked in this order: same league, relegation off on either side, naming styles differ, upper demotes N but lower promotes M, upper already has a league below, lower already has a league above, already in the same chain (loop). *Done when:* `league-links.test.ts` and `league.test.ts` pass covering each reason, a matching pair, a three-league chain, a corrupt loop in the data, and `isLeague` with and without valid and empty-string link ids; lint, typecheck and `npm test` pass.
- [x] **Step 2 - Link repository and league edit and delete.** New `src/leagues/league-link-repository.ts`: `linkLeagues(db, upperId, lowerId)` and `unlinkLeagues(db, upperId, lowerId)`, each reloading both leagues, re-running `linkProblem` on fresh data, and writing both documents in one batch. Result shape follows `LeagueResult` with new error kinds `link` (message) and `not-found`. Link also scans the two chains' franchises for a name collision. Update `updateLeague` to preserve link ids and apply `linkedEditProblems`, and `deleteLeague` to clear the neighbors' ids in its batch. *Done when:* repository tests with `createMemoryDatabase` pass: link and unlink write both sides; a refused link writes nothing; stale data (a neighbor linked meanwhile) is refused; a name collision across the chains is refused with the name; editing a linked league keeps its ids and rejects naming style, relegation-off and count changes; size edits still work; deleting a linked league clears the neighbor's id and a dangling id does not block relinking; lint, typecheck and `npm test` pass.
- [x] **Step 3 - Chain-wide team name uniqueness.** In `src/teams/franchise-repository.ts`, `createFranchise` and `updateFranchise` load the leagues (via `LEAGUE_COLLECTION` and `isLeague`, no import of `league-repository`, to avoid an import cycle), compute `chainLeagueIds`, and check `findDuplicateName` over the franchises of every league in the chain; the linked message above is used when the chain has more than one league. *Done when:* tests cover a duplicate in the linked league (create and update), no clash with a team in an unlinked league, a clash across a three-league chain, an edit that keeps its own name, and the unchanged message for unlinked leagues; existing franchise tests still pass; lint, typecheck and `npm test` pass.
- [x] **Step 4 - Linked leagues UI.** Add `src/components/leagues/linked-leagues.tsx`: the section, the inline picker, and the pending and error states described above. `LeagueDetail` renders it between the settings card and the teams, and receives the full league list from `src/app/index.tsx` (already loaded by `useLeagues`); after a link or unlink, call `refresh` so both leagues update. Add the unlink note to the delete confirmation. Each button has an accessibility label naming the league. *Done when:* lint, typecheck and `npm test` pass, and on web the user creates two matching leagues (upper demotes 2, lower promotes 2, same naming style), links them from either side, sees both details panes show the link, sees mismatched and wrong-style leagues disabled with a reason, hits a name-collision refusal, tries to change the naming style of a linked league and sees the unlink-first error, unlinks, and deletes a linked league and sees its neighbor unlinked. A reload shows the saved links.

## Files / areas

- `src/leagues/league.ts`, `src/leagues/league.test.ts` (fields, `isLeague`, `LEAGUE_COLLECTION`)
- `src/leagues/league-links.ts` + test (new, pure)
- `src/leagues/league-link-repository.ts` + test (new)
- `src/leagues/league-repository.ts` + test (`updateLeague`, `deleteLeague`, collection constant)
- `src/teams/franchise-repository.ts` + test (chain-wide uniqueness)
- `src/components/leagues/linked-leagues.tsx` (new), `league-detail.tsx`, `src/app/index.tsx`

## Data / contracts

- `League` adds `leagueAboveId?: string` and `leagueBelowId?: string`. Both are omitted (not `null`) when unset, so the stored document keeps the feature 3 shape for unlinked leagues. The link is symmetric: if A has `leagueBelowId = B`, then B has `leagueAboveId = A`. A one-sided link found in storage is treated as no link by the slot and chain functions when the other side does not point back.
- Ids are the existing `createId` strings; nothing new is generated.
- Link errors: `{ kind: 'link'; message: string }` (a `linkProblem` reason or the name collision), `{ kind: 'not-found' }`, `{ kind: 'storage'; error }`. The UI shows `message` verbatim.
- Edit errors reuse `{ kind: 'validation'; fields }` with the existing field keys (`namingStyle`, `promotedCount`, `demotedCount`, `counts`).
- No new dependency, route, or storage collection.

## Testing

- Pure and repository logic: unit tests as listed in each step, run with `npm test` (jest-expo, in-memory database).
- UI: lint, typecheck, and a manual web walkthrough at the end of step 4. No automated UI tests exist and none are added.
- No Verify command is declared in `AGENTS.md`; the gate is `npm run lint`, `npx tsc --noEmit`, and `npm test`.

## Notes for the AI

- Read the Expo docs only if a step touches an Expo API; this feature should not.
- Match the surrounding code: `done` and `storage` result helpers, `Button` and `ChoiceButton`, `FieldError`-style alert text, `Spacing` and `Accent` tokens.
- Compare team names with the existing `findDuplicateName` rather than a new matcher.
- Keep the first-pass design small: no link history, no chain view, no confirmation on unlink.

## Open questions

None. The user confirmed all three defaults at spec review (2026-10-13):

1. Direction of "matching counts": upper `demotedCount` equals lower `promotedCount` (the project overview lists the promoted/demoted wording as something to confirm).
2. Both leagues must have relegation on to link.
3. To change counts, naming style or relegation on a linked league, unlink first.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":10651,"specSha256":"e4d05de1c813c0bbd6d7f0ac6a3169aef794f7a767e0b0527da23657ea537fab","branch":"refs/heads/feature/linked-leagues","head":"e0680e34dccd9a619c89466cb0b211099226e258","baseRef":"refs/heads/main","baseCommit":"e0680e34dccd9a619c89466cb0b211099226e258","sourceTree":"8f80eb904146e60ef5dfce9bb4ef79ce13d375f1","landing":"local-merge","absentOptional":[]} -->
