# Feature: Name override and burning

**From build-plan:** feature 8b
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/name-override-and-burning`

## Goal

Let the commissioner hand-type a player's last name before the league is accepted, rejecting names that are invalid, burned or already in use, and burn every name on the league's rosters permanently when the league is accepted. Random names on rerolls already shipped in feature 6, so they are not part of this feature. This also resolves ledger lead F-02 (overlapping burns losing names).

## In scope

- Rename one player (standard or goalie) on an unaccepted league: the typed text goes through `normalizeName`. Invalid text (`null` result) is rejected with a message; a name that is burned, or on any other player in any stored roster (any league, including the same roster), is rejected as taken. Keeping the player's current name is a no-op success.
- Only the name changes; ratings, rolls and age are untouched. Rename uses the same lock as rerolls: once the league has a season it fails with `locked`, and a failed season lookup is a storage error, never "unlocked".
- Rename UI in the roster view: a Rename action per player opening an inline text field with a visible label, Save and Cancel; errors shown next to the field (alert role) and cleared on edit or cancel; hidden when the league is locked. Saved name appears in the roster and review.
- Burning on accept: `acceptLeague` burns every player name on the league's rosters in the same atomic batch as the season write (`burnNamesOp`). The burned set is read just before the batch, and the whole accept runs through the existing `createSerialQueue`, so two accepts cannot overwrite each other's burn (F-02). A name already burned at accept time fails the accept with a clear error and writes nothing. An unreadable burned registry fails the accept with a storage error and writes nothing.
- Rerolled-away names are never burned (only the names on the rosters at accept are). Deleting an accepted league does not un-burn anything.
- The accept confirmation text mentions that the names become permanently unavailable.
- Unit tests for each rule above.

## Out of scope

- Burning on offseason accept and drafting (features 12 and 13).
- Merging name registries on import (feature 9).
- Editing any value other than the name; renaming after accept; renaming teams.
- Requiring a typed name to be in the provided name list (any valid normalized name is allowed).
- Changing how random names are picked.

## Build loop

`workflow.stepReview: feature`: build every step, run the final check once, present one review packet. `checkpointCommits` is disabled; `/complete` makes the commit.

## Build steps

- [x] 1. **Rename rule (pure).** In `src/rosters/roster.ts` add `renamePlayer(roster, playerId, rawName, unavailable)` returning the updated roster or an error `{ kind: 'invalid-name' | 'name-taken' | 'not-found' }`. `unavailable` holds every name that may not be used (burned plus other players' names); the player's own current name is excluded by the caller. Done when `roster.test.ts` covers: lowercase and accented input is normalized, invalid input rejected, taken name rejected, same name accepted, unknown player id, other players and the player's rolls unchanged. `npm test` for that file passes.
- [x] 2. **Rename in the repository.** Add `renamePlayer(db, league, franchiseId, playerId, rawName)` to `src/rosters/roster-repository.ts`, reusing `lockFailure`, `loadTeam` and `unavailableNames` (the keep function excludes only the renamed player). Extend `RosterError` with `invalid-name` and `name-taken`. Done when `roster-repository.test.ts` covers: success persists only that player's name, taken by another roster in the same league, taken in another league, burned name, invalid text, locked league, storage failure on the season lookup and on the burned registry (nothing written), and no change on a rejected rename.
- [x] 3. **Rename UI.** In `src/components/rosters/roster-view.tsx` add the Rename action, inline field, Save and Cancel, and field-level error text. Update `rosterErrorText` for the new kinds, and make the shared error prefix fit renames (not "Could not reroll"). Done when lint and `tsc --noEmit` pass and a manual check on an unaccepted league shows: rename succeeds and the roster shows the new name; a taken or burned name and invalid text each show a message beside the field; an accepted league shows no Rename action.
- [x] 4. **Burn on accept.** Update `src/seasons/accept-league.ts`: read the burned set, add a `burned-names` error kind (with its text in `acceptErrorText`) when a roster name is already burned, build `burnNamesOp` for all roster names and batch it with the season put, all inside one module-level `createSerialQueue` task. Update the confirm text in `league-review.tsx`. Done when `accept-league.test.ts` covers: all roster names burned after accept; rerolled-away names not burned; accepting a second league keeps the first league's burned names; two accepts started together both keep their names; an already-burned roster name rejects the accept with nothing written; an unreadable registry rejects the accept with nothing written; a failed batch burns nothing and creates no season; a rename before accept is what gets burned.
- [x] 5. **Final check.** Run `npm test`, `npm run lint` and `npx tsc --noEmit` once. Done when all three pass.
- [x] 6. **Fix F-06: name length limit.** Export `NAME_MAX_LENGTH = 40` from `src/rosters/roster.ts`; `renamePlayer` rejects a normalized name longer than that as `invalid-name`; the roster view's text field uses the same constant. Done when `roster.test.ts` covers a name at the limit (accepted) and one over it (rejected) and `npm test`, lint and `tsc` pass.
- [x] 7. **Fix F-07: serialize rename with accept.** Move the accept queue to `src/seasons/accept-queue.ts` (exporting the shared `createSerialQueue` instance); `acceptLeague` and the repository `renamePlayer` both run through it, so the rename's lock check and write cannot straddle an accept. Done when `accept-league.test.ts` or `roster-repository.test.ts` shows a rename started together with an accept either lands before it (and is burned) or fails `locked`, and bypassing the queue makes that test fail; `npm test`, lint and `tsc` pass.

## Files / areas

- `src/rosters/roster.ts`, `src/rosters/roster-repository.ts` and their tests.
- `src/components/rosters/roster-view.tsx`, `src/components/rosters/league-review.tsx`.
- `src/seasons/accept-league.ts` and its test.
- Reused unchanged: `src/names/name-registry.ts`, `src/names/normalize-name.ts`, `src/storage/serial-queue.ts`.

## Data / contracts

- No new collections or stored fields. Player `name` stays a normalized string (uppercase letters, spaces, apostrophes, hyphens); the burned registry stays one document `nameRegistry/burned` with a sorted `names` array.
- `RosterError` gains `invalid-name` and `name-taken`. `AcceptError` gains `burned-names`. Existing result shapes (`{ ok, value } | { ok: false, error }`) are unchanged.
- Name uniqueness scope matches the existing picker: unique across all stored rosters in all leagues, plus never burned.
- The registry write is a read-modify-write of the whole document; correctness relies on it running inside the accept's serial queue and the same batch as the season.

## Testing

Jest-expo unit tests with the in-memory `Database`, as in features 6 and 7. Component files cannot be imported in jest, so all rules live in the pure modules above. UI behavior in step 3 is checked by hand; no browser test command exists, and no live or visual evidence is claimed until that check is run.

## Notes for the AI

- Read Expo SDK 57 docs before touching any Expo or React Native API (for example `TextInput` accessibility props).
- User-typed names render only as text, never interpreted. The field needs a label, error association and focus handling like `team-form.tsx`; follow that file.
- No Verify command is declared in `AGENTS.md`; the final gate is step 5.
- After landing, the build-plan line for 8b should drop "Name rerolls" (already built in feature 6).

## Open questions

None blocking. Assumptions to confirm at review: (1) a typed name need not be in the provided list; (2) names are stored uppercase, so typed text is normalized rather than kept as typed.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":8391,"specSha256":"33cb16d51bd5f1d265bf0a4f0630b41b2cdba208f23630a40c52bbad6d0c2150","branch":"refs/heads/feature/name-override-and-burning","head":"a6fb5215b87566e05b2a6bee52fd2291775c29b1","baseRef":"refs/heads/main","baseCommit":"a6fb5215b87566e05b2a6bee52fd2291775c29b1","sourceTree":"2ecb56b475dbc8146c69b6ddbaf6e40748037e83","landing":"local-merge","absentOptional":[]} -->

## Findings

### 8b/F-02 [P2] closed - Burned-name registry can lose a name if two burns overlap

**File:** src/names/name-registry.ts:41
**Found:** 2026-10-13 by /audit (scope: current; lens: quality, security, performance, tests)
**Why it matters:** `burnNames` reads the whole burned set and then writes the whole document back. Two overlapping calls would each start from the same set and the later write would drop the earlier call's names, and burned names are meant to be permanent. Nothing calls it yet, and one commissioner makes this unlikely, so it is a lead and not a confirmed defect.
**Suggested fix:** When features 7 and 8b wire it in, read the set and build `burnNamesOp` inside the same operation as the accept write, so only one accept can run at a time (the existing UI already blocks a second accept while one is saving). Re-check then whether a guard is needed.
**Resolution:** Closed 2026-10-14 by /audit (feature 8b). `acceptLeague` now reads the burned set and writes `burnNamesOp` in the same batch as the season, inside a module-level serial queue. Nothing else writes the registry (`burnNames` has no caller). The concurrency test fails when the queue is bypassed (checked by temporarily removing it).

### 8b/F-06 [P3] closed - Typed names have no length limit below the text field

**File:** src/rosters/roster.ts:146
**Found:** 2026-10-14 by /audit (scope: current; lens: quality, security, performance, tests)
**Why it matters:** `renamePlayer` accepts any length that normalizes; only the text field caps it at 40 (the longest provided name is 16). A long name would be stored and break card and row layouts.
**Suggested fix:** Reject names over a small maximum in `renamePlayer` as `invalid-name`, with a test; match the field's cap.
**Resolution:** Fixed in spec step 6: `NAME_MAX_LENGTH = 40` is enforced in `renamePlayer` and used by the text field; boundary tests added. Closed 2026-10-14 by /audit: re-read the repaired code and tests; the defect is gone and no new one was introduced.

### 8b/F-07 [P3] closed - Rename is not serialized with accept

**File:** src/rosters/roster-repository.ts:221
**Found:** 2026-10-14 by /audit (scope: current; lens: quality, security, performance, tests)
**Why it matters:** `renamePlayer` checks the lock, then writes later. If an accept finished in between, the rename would change a name on an accepted roster after its old name was burned. Rename and accept live on different screens, so one commissioner cannot realistically overlap them; this is a lead, not a confirmed defect.
**Suggested fix:** If it ever matters, run rename through the same serial queue as accept, or re-check the season inside the write. No change needed now.
**Resolution:** Fixed in spec step 7: rename and accept share `acceptQueue`, so a rename started with an accept either lands first (and is burned) or fails `locked`. Two ordering tests fail when the queue is bypassed. Closed 2026-10-14 by /audit: re-read the repaired code and tests; the defect is gone and no new one was introduced.

### Carried note (from the ledger header, not a finding)

**Unverified risks (not recorded as defects):** `list(collection)` loads and parses every document, which will be slow if the 50k-name registry is stored as one document per name; prefer `get` per name and a size-aware design when feature 8 is specced. No current dependency scan was possible offline (`npm audit --offline` reported 0 from cached data only). With WAL enabled, the SQLite database is no longer a single file, so feature 9 (export/import) should export through the `Database` interface (`list`), not by copying `futti.db`. The chart cells were compared with the reference file once (314 cells, 0 mismatches) by a throwaway test that was not kept, so no automated guard compares them with the original; later chart edits should repeat that check.

## Try it now

1. Start the app (`npm start`), open an unaccepted league that is full and has rosters generated, and open a team.
2. Press **Rename** on a player, type a lower-case name such as `quimby`, and press **Save**. The roster shows `QUIMBY`.
3. Rename another player to a name already on any roster, and to `R2D2`. Each shows a message beside the field and changes nothing.
4. Go back to the teams, press **Review and accept**, read the confirmation (it says names become permanently unavailable), and accept.
5. Open a team again: no Rename or Reroll buttons remain. Names on the accepted rosters can no longer be handed out by rerolls in other leagues.
