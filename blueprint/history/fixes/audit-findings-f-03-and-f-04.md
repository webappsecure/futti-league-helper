# Fix: Audit findings F-03 and F-04

**Type:** Fix
**Status:** verified
**Branch:** `fix/audit-findings-f-03-and-f-04`
**Fixes:** F-03, F-04

## The problem

- **F-03 [P2]** On a linked league, turning promotion and relegation off and pressing Save is refused with `fields.counts` ("Promotion and relegation must stay on while linked..."), but [league-form.tsx:174](../../src/components/leagues/league-form.tsx) renders `errors.counts` only inside the `relegation &&` block, which is hidden when the toggle is off. The save does nothing visible.
- **F-04 [P3]** `linkLeagues` and `unlinkLeagues` repeat the same load-two-leagues preamble with a `failed as LinkResult` cast, and `createFranchise` and `updateFranchise` repeat the same chain duplicate-name block.

## The fix

- **F-03:** render `errors.counts` under the Promotion and relegation switch row, outside the `relegation &&` block, so it shows whether the toggle is on or off. When the toggle is on the message appears in the same visual place as before (just under the switch row instead of under the count fields). No change to the validation messages or keys.
- **F-04:** in `league-link-repository.ts`, replace `fromListing` and the casts with one `loadPair(db, upperId, lowerId)` helper returning either the loaded `{ leagues, upper, lower }` or the `LinkResult` failure to return as is (storage error, or `not-found`). In `franchise-repository.ts`, move the chain duplicate check into one helper `chainDuplicateError(db, league, name, exceptId?)` that returns the field error or `null`, or a storage failure, used by both create and update.
- Must not change: link and unlink behavior, error kinds and messages, the two duplicate-name messages, or any stored data. No new dependency or abstraction beyond the two small helpers.

## Build steps

- [x] **Step 1 - Show the counts error (F-03).** Move the `counts` `FieldError` in `src/components/leagues/league-form.tsx` out of the `relegation &&` block to just under the switch row. Add an `updateLeague` test in `league-link-repository.test.ts` that turning relegation off on a linked league is refused with `fields.counts` (the existing test already covers the key; extend only if the assertion on the message text is missing). *Done when:* lint, typecheck and `npm test` pass, and on web, editing a linked league, switching relegation off and saving shows the unlink-first message under the switch and writes nothing.
- [x] **Step 2 - Remove the repetition (F-04).** Add `loadPair` and `chainDuplicateError` as described and use them. *Done when:* the existing `league-link-repository.test.ts`, `franchise-repository.test.ts` and `league-repository.test.ts` pass unchanged, no `as LinkResult` cast remains, and lint, typecheck and `npm test` pass.

## Verify

`npm run lint`, `npx tsc --noEmit`, `npm test`; then the web check in step 1. `/audit` re-reviews both findings before they close.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":2909,"specSha256":"e63f8b167a0c7fdebbdbdffe5fef8fd2e1e2caa1d31b89b7773372307ec9def0","branch":"refs/heads/fix/audit-findings-f-03-and-f-04","head":"0b7734b1050b203febab14cb393f2e1eee38cf66","baseRef":"refs/heads/main","baseCommit":"0b7734b1050b203febab14cb393f2e1eee38cf66","sourceTree":"e7fe91cf8ecf95652e641161715dd64fc68a479e","landing":"local-merge","absentOptional":[]} -->

## Findings

### audit-findings-f-03-and-f-04/F-03 [P2] closed - Relegation-off refusal on a linked league shows no message

**File:** src/components/leagues/league-form.tsx:174
**Found:** 2026-10-13 by /audit (scope: path, landed feature 5; lens: quality, security, performance, tests)
**Why it matters:** `linkedEditProblems` reports "Promotion and relegation must stay on while linked" under `fields.counts`, but the form only renders `errors.counts` inside the `relegation &&` block. A user who switches the toggle off on a linked league and presses Save sees nothing happen: the save is refused and the reason is hidden because the counts fields are hidden with the toggle off.
**Suggested fix:** Render the `counts` error outside the `relegation &&` block (or return the message under a key the toggle row shows), and add a test of `updateLeague` asserting the key the form renders.
**Resolution:** `errors.counts` now renders under the Promotion and relegation switch row (league-form.tsx:146), outside the `relegation &&` block, so the unlink-first refusal is visible with the toggle off; with the toggle on it still shows. Re-reviewed league-form.tsx and the `linkedEditProblems` key (`counts`): no new defect found.

### audit-findings-f-03-and-f-04/F-04 [P3] closed - Small repetition in the link and franchise code

**File:** src/leagues/league-link-repository.ts:29
**Found:** 2026-10-13 by /audit (scope: path, landed feature 5; lens: quality, security, performance, tests)
**Why it matters:** `linkLeagues` and `unlinkLeagues` repeat the same load-and-cast preamble (`return failed as LinkResult` after a `fromListing` check), and `createFranchise` and `updateFranchise` repeat the same chain duplicate-name block. Neither is a defect; both are easy places for the two copies to drift.
**Suggested fix:** Return the listing error directly with a type guard instead of the cast, and move the chain duplicate check into one helper in `franchise-repository.ts`. Nothing is lost.
**Resolution:** `loadPair` replaces the repeated preamble and both `as LinkResult` casts; `chainDuplicateError` replaces the two copies of the chain duplicate check, with the same messages. Re-reviewed league-link-repository.ts, franchise-repository.ts and their tests: behavior unchanged, no new defect found.
