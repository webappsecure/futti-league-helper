# Feature: Rating and dice engine

**From build-plan:** feature 2
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/rating-and-dice-engine`

## Goal

Build the pure, fully unit-tested rules module that turns dice rolls into Fütti ratings exactly as the charts in `blueprint/reference/futti-program-specs.txt` specify, including the goaltending base-6 arithmetic. Every function takes an injectable random source and reports the dice it used, so later features can show "rolled 7" beside each outcome and tests can replay exact rolls. A wrong chart cell would quietly corrupt every league, so this feature is mostly about correctness.

## In scope

- `src/rules/` module with no React, storage, or Expo imports
- Random source type and dice primitives (d6, 2d6) plus a scripted test helper
- Goaltending rating arithmetic: add or subtract steps in the 31-36, 41-46 sequence, validation, clamping to caller-supplied bounds, retirement threshold check
- Chart data and lookups transcribed from the spec: initial age, draft age, total OF+DE by grade, draft total OF+DE, OF/DE split per total, control stars per total, sportsmanship, goaltending by grade, draft goaltending
- Generation functions that return every value together with the roll that produced it: initial standard player, initial goaltender, draft standard player, draft goaltender (names excluded)
- Reusable building blocks that the offseason will call again (`splitTotal`, `controlStars`, goaltending arithmetic)
- Exact unit tests for every chart and rule, and a one-time check of the transcription against the reference file

## Out of scope

- Names and the name registry (feature 8)
- Rosters, teams, leagues, persistence and any UI (features 3 to 7)
- Offseason flow: promoted/demoted rating adjustments, aging, retirement choice, progression, draft pool sizing (features 11 to 13). Their dice charts live elsewhere in the spec; only the generation charts are built here.
- Storing generated values (this module returns plain data only)

## Build loop

Build one small step at a time. Follow `workflow.stepReview` in `blueprint/config.json`: `feature` produces one review packet after all steps. Checkpoint commits are disabled. `/complete` makes the final feature commit. Never accept a review packet you have not read; split any diff that is too large to review.

## Build steps

- [x] **Step 1 - Dice primitives and test RNG** - `src/rules/dice.ts`: `type Rng = () => number` (a value in [0, 1) like `Math.random`), `rollDie(rng)` returning 1-6, `roll2d6(rng)` returning 2-12 (two `rollDie` calls). `src/rules/test-rng.ts`: `rngFromDice(...faces)` returns an Rng that replays the given d6 faces in order and throws when it runs out. *Done when:* `src/rules/dice.test.ts` passes covering the boundaries (rng 0 gives 1, rng just under each k/6 gives k, rng just under 1 gives 6), the 2d6 sum, replay order, and an exhausted script throwing; lint and typecheck pass.
- [x] **Step 2 - Goaltending base-6 arithmetic** - `src/rules/goaltending.ts`. A rating has two digits, each 1-6 (so 36 is followed by 41 and 41 is preceded by 36; 31 minus 1 is 26). Functions: `isValidGoaltending(n)`, `addGoaltending(rating, steps, bounds?)` (steps may be negative; result clamped to `bounds.min`/`bounds.max` when given; throws `RangeError` for an invalid rating or a result outside 11-66), `isGoaltendingRetired(rating)` (true at or below 26). *Done when:* `goaltending.test.ts` passes covering 36+1=41, 41-1=36, 31-1=26, 46+1 clamped at a given max of 46, 31-2 clamped at a given min of 31, +2 and -2 crossing the 36/41 gap, 26 and 25 retired while 31 is not, invalid ratings (30, 37, 47, 7, 3.5) rejected; lint and typecheck pass.
- [x] **Step 3 - Chart data and lookups** - `src/rules/charts.ts`, laid out row by row like the spec tables so it can be proofread against them. Lookups take the 2d6 or d6 roll and return the value: `initialAge(roll)`, `draftAge(roll)`, `initialTotal(grade, roll)`, `draftTotal(roll)`, `splitFor(total, roll)`, `starsFor(total, roll)`, `sportsmanshipFor(roll)`, `initialGoaltending(grade, roll)`, `draftGoaltending(roll)`. Out-of-domain input (roll outside the table, total outside 2-8 for split and stars, unknown grade) throws `RangeError`. `Grade` is `'A' | 'B' | 'C' | 'D' | 'F'`. *Done when:* `charts.test.ts` passes with every cell of the age, draft age, draft total, sportsmanship and draft goaltending tables checked, every row of the two grade tables for all five grades, every split and star band for totals 2-8 (including each band edge), and invariants (offense + defense equals the total, each at least 1, stars 0-2, star counts never rise as the roll rises); lint and typecheck pass.
- [x] **Step 4 - Player generation with roll traces** - `src/rules/player-generation.ts`: `generateStandardPlayer(grade, rng)`, `generateGoaltender(grade, rng)`, `generateDraftStandardPlayer(rng)`, `generateDraftGoaltender(rng)`, plus exported `splitTotal(total, rng)` and `controlStars(total, rng)`. Roll order is fixed: standard = age, total, split (skipped when the total is 2), stars, sportsmanship; goaltender = age, goaltending, sportsmanship. Results carry the value and the roll (`{ value, roll }`, with `roll: null` when no roll was needed). Goaltender sportsmanship uses the same sportsmanship chart as players. *Done when:* `player-generation.test.ts` passes with scripted dice for at least one player at each grade and each total path (including total 2 with no split roll and a two-star player), both goaltender paths, both draft paths, roll order pinned by scripted dice, and a seeded-random smoke test (a simple deterministic LCG, 1000 players per grade) asserting only invariants: ratings within range, offense plus defense equal to the total, goaltending always a valid rating at least 31; lint and typecheck pass.
- [x] **Step 5 - Transcription check and final gate** - Write a throwaway script outside the repo (scratchpad), run it once, and do not commit it. It parses the markdown tables and the split and star bullet lists in `blueprint/reference/futti-program-specs.txt` and compares every cell with the values `charts.ts` returns, then report the result. Run `npm run lint`, `npx tsc --noEmit` and `npm test`. *Done when:* the script reports zero mismatches across all chart cells and bands, and all three commands pass.
- [x] **Step 6 - Repair F-01 (input validation)** - In `charts.ts`, validate the grade against `GRADES` instead of `grade in GRADE_COLUMN` so inherited keys such as `'toString'` and `'constructor'` throw `RangeError`. In `goaltending.ts`, `addGoaltending` throws `RangeError` when `bounds.min` is greater than `bounds.max`. Add tests for both. *Done when:* `charts.test.ts` rejects `'toString'`, `'constructor'` and `'__proto__'` as grades for `initialTotal` and `initialGoaltending`, `goaltending.test.ts` rejects `{ min: 46, max: 31 }`, F-01 is marked `fixed`, and lint, typecheck and `npm test` pass.

## Files / areas

- New `src/rules/dice.ts`, `test-rng.ts`, `goaltending.ts`, `charts.ts`, `player-generation.ts` and their `.test.ts` files (test-rng has no test file of its own; `dice.test.ts` exercises it)
- No changes to existing files except `blueprint/` bookkeeping

## Data / contracts

- No persisted data. All functions are pure apart from the supplied `Rng`.
- `Rng = () => number` returning a value in [0, 1). `rollDie(rng) = 1 + Math.floor(rng() * 6)`; a value outside [0, 1) throws `RangeError`.
- `Rolled<T> = { value: T; roll: number | null }` where `roll` is the 2d6 total or d6 face that selected the value.
- Standard player result: `{ age: Rolled<number>, total: Rolled<number>, split: { offense: number; defense: number; roll: number | null }, stars: Rolled<0 | 1 | 2>, sportsmanship: Rolled<number> }`. Goaltender result: `{ age: Rolled<number>, goaltending: Rolled<number>, sportsmanship: Rolled<number> }`. Names, ids and team data are added by later features.
- Goaltending ratings are integers whose two digits are each 1-6. Creation range is 32-46 for the initial chart and 31-45 for the draft chart; the arithmetic domain is 11-66. The retirement threshold (at or below 26) is exposed as a function, not applied here.
- Ages: initial = 18 + 2d6 (20-30). Draft ages come from the draft chart (18-22).
- Errors: invalid inputs throw `RangeError`; nothing here returns a `Result` because no I/O happens.

## Testing

- `npm test` is a gate (test runner exists). Every function in this feature is logic and gets tests; there is no UI or integration surface, so no browser or manual checks.
- Chart tests assert exact cells. Because the expected values and the code both come from the same source text, Step 5 adds an independent comparison against the original reference file so a mistyped cell cannot hide in both.
- Statistical distribution tests are not used (flaky); boundary and scripted-dice tests pin behavior instead.

## Notes for the AI

- Transcribe from `blueprint/reference/futti-program-specs.txt` (read it, do not retype from memory). The spec's goaltender chart paragraph says "sportsmanship" but is the goaltending (GO) rating; goaltender SP uses the normal sportsmanship chart. Treat this as settled.
- Keep the module free of React, Expo, storage and `Math.random` defaults baked into logic: the caller passes the `Rng` (callers will pass `Math.random`).
- Follow `blueprint/context/coding-standards.md`: strict TypeScript, no `any`, kebab-case files, minimal comments, no em dashes.
- Do not build offseason adjustments or progression here. They are not specified precisely enough yet (see Open questions) and belong to features 11 to 13.

## Decisions for features 11 to 13

Answered by the user; they do not change this feature but must be honored when those features are specced.

- **Promoted-team players:** offense and defense each rise by 1 (each capped at 5, total capped at 8). If both rising would push the total above 8, only the lower of the two rises (4 and 3 becomes 4 and 4). With a total already at 8 nothing changes.
- **Goaltender retirement threshold:** any rating at or below 26 retires (`isGoaltendingRetired`).
- **Retirement tie-break** (among unprotected players with the same oldest age): a goaltender always retires before a position player. Among position players the lowest OF + DE total retires, then the lowest sportsmanship, then a random choice. Among goaltenders the lowest goaltending rating retires, then the lowest sportsmanship, then a random choice.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":10481,"specSha256":"799356cff87ce0f6387b31c941f312f637c48911a5c62c90ff1b238290467b2b","branch":"refs/heads/feature/rating-and-dice-engine","head":"2505e5db521f9c2985a737de53f5e880dd3e3307","baseRef":"refs/heads/main","baseCommit":"2505e5db521f9c2985a737de53f5e880dd3e3307","sourceTree":"facb64ecaaa129a1124cfd435e29d31b93aad868","landing":"local-merge","absentOptional":[]} -->

## Findings

### 2/F-01 [P3] closed - Grade and goaltending-bound validation accepts some bad input

**File:** src/rules/charts.ts:156 (also src/rules/goaltending.ts:39)
**Found:** 2026-10-13 by /audit (scope: current; lens: quality, tests)
**Why it matters:** `assertGrade` uses `grade in GRADE_COLUMN`, which is also true for inherited keys, so `initialTotal('toString' as Grade, 7)` passes validation and returns `undefined` instead of throwing the documented `RangeError`. Grades will later come from persisted data, where a corrupt value is a real input. Separately, `addGoaltending` with `min` greater than `max` silently returns `max` instead of rejecting the contradictory bounds. Neither case is tested.
**Suggested fix:** Validate the grade with `GRADES.includes(grade)` (or `Object.hasOwn`) and add a test using `'toString'`; throw `RangeError` when `bounds.min > bounds.max` and add a test.
**Resolution:** Re-reviewed charts.ts:156-158 and goaltending.ts:35-39: grades are checked against GRADES (inherited keys like 'toString' and '__proto__' now throw), reversed bounds throw, equal bounds still work; tests at charts.test.ts:174 and goaltending.test.ts:62 cover both. No new defect found.
