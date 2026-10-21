# Feature: Name list and registry

**From build-plan:** feature 8a
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/name-list-and-registry`

## Goal

Turn the provided last-name file into clean app data and give later features the two things they need from it: a way to pick a random name nobody has taken, and a permanent registry of burned names. This is the data and rules half of the original feature 8. The parts that need rosters (rerolls, hand-typed override with duplicate checks, burning when a league is accepted) are 8b, built after features 6 and 7, and will call what is built here.

## In scope

- `normalizeName(raw)`: strips accents, maps `Ł` to `L`, `Ø` to `O` and `Æ` to `AE`, removes periods and trailing apostrophes, uppercases, turns the curly apostrophe `’` into `'`, collapses runs of spaces and trims; keeps spaces, apostrophes and hyphens. Returns `null` for an empty result or one containing any character other than `A` to `Z`, space, `'` or `-`, or not starting with a letter
- `buildNamePool(lines)`: normalizes every line, drops invalid ones, removes duplicates after normalizing (so `MARTIN` and `MARTÍN` become one), and returns the sorted unique names plus a report (lines read, invalid names dropped with their original text, duplicates removed)
- A build script that reads `blueprint/reference/lastnames.txt` and writes the generated, committed `src/data/last-names.json` (a sorted JSON array of names), printing the report
- `NAME_POOL`: the generated list exposed as a typed read-only array
- `pickRandomName(pool, unavailable, rng)`: a uniformly random name not in the `unavailable` set using the injectable `Rng`, or `null` when none is left
- Burned-name registry over the existing `Database`: `getBurnedNames(db)`, `burnNamesOp(burned, names)` (an `Op` to compose into another atomic batch, as feature 7's accept will) and `burnNames(db, names)`; burning is permanent and idempotent, with no way to remove a name
- Unit tests for normalization, pool building, the committed list, picking and the registry

## Out of scope

- Wiring names into player generation or rerolls (features 6 and 8b), the manual name override and its duplicate check against rosters (8b), and burning on league or offseason accept (7, 8b, 12, 13)
- Any screen or route; nothing in the app imports the list until feature 6, so this feature adds no UI
- Export and import merging of the registry (feature 9)
- Keeping the original accented spelling; names are normalized uppercase everywhere
- Name list editing, per-league lists, or a runtime loader or worker; the list is bundled data

## Build loop

Build one small step at a time. Follow `workflow.stepReview` in `blueprint/config.json`: `feature` produces one review packet after all steps. Checkpoint commits are disabled. `/complete` makes the final feature commit. Never accept a review packet you have not read; split any diff that is too large to review.

## Build steps

- [x] **Step 1 - Name normalization and pool building** - `src/names/normalize-name.ts` (pure, no React) with `normalizeName(raw): string | null` and `buildNamePool(lines): { names: string[]; invalid: string[]; duplicatesRemoved: number; linesRead: number }`. Decompose with Unicode NFD and remove combining marks, map `Ł` and `Ø` (and `ł`, `ø`) to `L` and `O` and `Æ` (and `æ`) to `AE` before decomposing, remove periods, uppercase, replace `’` with `'`, collapse whitespace runs to one space and trim. Reject with `null` an empty result, a name that does not start with `A` to `Z`, or one with any character outside `A` to `Z`, space, `'` and `-`. `buildNamePool` skips blank lines, sorts by plain code-unit order and removes duplicates only after normalizing; `invalid` holds the original text of each dropped line. *Done when:* `normalize-name.test.ts` passes covering `MARTÍN` and `MARTIN` giving one pool entry, `ŁUKASZ` to `LUKASZ`, `KJÆR` to `KJAER`, `ST. JOHN` to `ST JOHN`, a name whose period-stripped form already exists counted as a duplicate, `ØSTBY` to `OSTBY`, `ÅBERG`, `ADAMČÍK`, `ß` to `SS`, `A’LEA` and `A'LEA` equal, `O'BRIEN`, `VAN DER BERG` (kept spaces), `SMITH-JONES` (kept hyphen), runs of spaces collapsed, lowercase input uppercased, and `null` for empty, whitespace only, `123`, `SMITH2`, `-SMITH`, a CJK name and an emoji; the pool is sorted and the same input in a different order gives the same output; lint and typecheck pass.
- [x] **Step 2 - Generate and commit the name list** - `scripts/build-name-list.mts`, run with `node scripts/build-name-list.mts` (Node runs TypeScript directly; it imports `buildNamePool` from `src/names/normalize-name.ts`; `scripts/` is excluded from `tsconfig.json` typechecking because `@types/node` is not installed and the import needs a `.ts` extension). It reads `blueprint/reference/lastnames.txt` as UTF-8, writes `src/data/last-names.json` as a sorted array, one name per line for readable diffs, and prints lines read, invalid dropped (each original text, up to the first 50), duplicates removed and names written. Add `src/names/name-pool.ts` exporting `NAME_POOL: readonly string[]`. Add `npm run build:names`. *Done when:* the script has been run and its report shown to the user, who confirms the invalid-name list is acceptable; `last-names.test.ts` passes asserting the committed list is more than 50,000 names, every entry equals `normalizeName(entry)`, entries are strictly sorted (so unique), none contains `’` or a non-ASCII character, `A'LEA` is present, and `MARTIN` appears once; lint and typecheck pass.
- [x] **Step 3 - Random pick and burned-name registry** - `src/names/pick-name.ts` with `pickRandomName(pool, unavailable, rng)`: try random indexes a bounded number of times (50), then fall back to listing the available names and picking one, returning `null` when none are available; use `Rng` from `src/rules/dice.ts` and reject an out-of-range value the way `rollDie` does. `src/names/name-registry.ts`: collection `nameRegistry`, one document id `burned` holding `{ names: string[] }` (sorted, normalized); `getBurnedNames(db)` returns an empty set when the document is absent and a storage error when it is present but malformed (never treated as empty, so a damaged registry cannot silently forget burned names); `burnNamesOp(burned, names)` returns the `put` that stores the union, normalizing each name and throwing `RangeError` for a name `normalizeName` rejects; `burnNames(db, names)` reads, then writes that op; burning an already burned name changes nothing. *Done when:* `pick-name.test.ts` and `name-registry.test.ts` pass on the in-memory database covering a seeded pick being reproducible, uniform spread over a small pool (every name appears across many seeded draws), unavailable names never returned, `null` for an empty pool and a fully unavailable pool, the fallback path returning the last available name when nearly all are unavailable, empty registry on first read, burn then read back, accent and case variants burning the same name, repeated burn leaving one entry, two burns accumulating, malformed stored document returning an error and writing nothing, and `burnNamesOp` composing with another `put` in one `batch`; lint and typecheck pass.
- [x] **Step 4 - Final checks** - Run lint, typecheck, `npm test` and `npx expo export --platform web`. *Done when:* all four are green. Nothing here is user-facing, so no manual run is needed; the bundle-size cost of the 60,000-name list cannot be measured until feature 6 first imports it, and that is noted for that feature.
- [x] **Step 5 - Strip trailing apostrophes (user request)** - After the step 2 list review the user asked that `FONTE'` and `PIETRE'` lose their apostrophe. `normalizeName` removes apostrophes at the end of a name (an apostrophe inside a name, as in `O'BRIEN`, is kept), the list is regenerated, and a name that becomes a duplicate (`FONTE'` of `FONTE`) is dropped. *Done when:* `normalize-name.test.ts` covers `FONTE'` to `FONTE`, the curly `PIETRE’` to `PIETRE`, `O'BRIEN'` to `O'BRIEN` and a lone `'` rejected; `last-names.test.ts` asserts no name ends in an apostrophe and `PIETRE` is present; the regenerated list has 62,198 names; lint, typecheck and `npm test` pass.
- [x] **Step 6 - Repair audit finding F-01** - Replace the hand-written string comparators in `buildNamePool` (`src/names/normalize-name.ts`) and `burnNamesOp` (`src/names/name-registry.ts`) with the default `.sort()`, which orders strings by UTF-16 code unit. F-02 is an unverified lead for features 7 and 8b and is not repaired here. *Done when:* the existing sorted-order tests (`normalize-name.test.ts`, `last-names.test.ts`, `name-registry.test.ts`) still pass unchanged, `src/data/last-names.json` regenerates byte-identical, F-01 is marked `fixed`, and lint, typecheck and `npm test` pass.
- [x] **Step 7 - Repair audit finding F-03** - In `normalizeName` (`src/names/normalize-name.ts`) remove trailing apostrophes before the final trim, so a name such as `SMITH '` becomes `SMITH` and the result never ends in a space. Normalizing a normalized name must return it unchanged. F-02 stays an unverified lead for features 7 and 8b and is not repaired here. *Done when:* `normalize-name.test.ts` covers `SMITH '` to `SMITH`, `O' '` to `O`, `O'BRIEN' '` to `O'BRIEN`, and that `normalizeName(normalizeName(x))` equals `normalizeName(x)` for every example in the file; `src/data/last-names.json` regenerates byte-identical; a burn of `SMITH '` stores `SMITH` and reads back in `name-registry.test.ts`; F-03 is marked `fixed`; lint, typecheck and `npm test` pass.

## Files / areas

- New `src/names/normalize-name.ts`, `name-pool.ts`, `pick-name.ts`, `name-registry.ts` and tests for each, plus `last-names.test.ts`
- New `src/data/last-names.json` (generated, committed) and `scripts/build-name-list.ts`
- Changed `package.json` (adds the `build:names` script only) and `tsconfig.json` (excludes `scripts/` from typechecking)
- Reused unchanged: `Rng` from `src/rules/dice.ts`, `Database`, `Op` and `Result` from `src/storage/types.ts`, `createMemoryDatabase`, `src/rules/test-rng.ts`
- No new dependency, route, screen or schema version change

## Data / contracts

- Normalized name: a non-empty string of `A` to `Z`, spaces, `'` and `-`, starting with a letter, with no leading, trailing or repeated spaces. The same string is the registry key, the pool entry and what the app displays; the original spelling is not kept.
- `src/data/last-names.json`: a JSON array of unique normalized names in plain code-unit order, generated from `blueprint/reference/lastnames.txt` by `npm run build:names` and committed so any clone builds. Regenerating from the same input gives byte-identical output. Names that fail normalization are dropped and reported by the script, never silently altered.
- Burned registry: collection `nameRegistry`, document id `burned`, value `{ names: string[] }` of unique normalized names, sorted. It only grows. One document is enough because the registry holds only names that reached an accepted league (hundreds per season, not the 60,000-name list); revisit if it ever reaches many tens of thousands. It is replaced whole in one `batch`, so composing `burnNamesOp` with other writes (feature 7's accept) is atomic. A new collection needs no migration; the schema version stays 1.
- Result style follows the storage layer: `Result<T>` success or failure carrying an `Error`. `burnNamesOp` throws `RangeError` for a name that is not a valid normalized name, because callers pass names that already came from the pool or were validated; it never writes in that case.
- `pickRandomName` is pure: it never reads or writes storage. The caller supplies `unavailable` (the burned set plus names already on unaccepted rosters), so reroll behavior in 6 and 8b needs no registry change.
- Rendering: names are plain text only; the allowed character set contains nothing that could be read as markup.

## Testing

- `npm test` is a gate. All logic in this feature is pure or runs on the in-memory database, so every step ships its tests; the committed list has its own guard test so a bad regeneration fails.
- The script is run once by hand and its report reviewed by the user (step 2). There is no UI, so no manual web or iOS run is claimed.
- The SQLite and IndexedDB backends are covered by feature 1; this feature uses the `Database` interface only.
- Baseline observed at spec time: typecheck passes and `npm test` passes (15 suites, 191 tests) on `main`.

## Notes for the AI

- Expo SDK 57: this feature uses no Expo or React Native API. The list is a JSON module imported with `resolveJsonModule`, which the Expo base config already enables.
- Keep everything in `src/names/` free of React. Follow `blueprint/context/coding-standards.md`: strict TypeScript, no `any`, kebab-case files, `@/` imports, minimal comments, no em dashes.
- Do not add a dependency, a state library, a worker or lazy loading. Do not start a dev server.
- Do not edit or commit `blueprint/reference/lastnames.txt`; it stays a local input. Only the generated `src/data/last-names.json` is committed.

## Open questions

Chosen here, open to change (reversible):

- Decided by the user after the step 2 report (and step 5): trailing apostrophes are removed; `Æ` maps to `AE`, periods are removed (a name that becomes a duplicate is dropped), names ending in `*` stay dropped, and `CARNOVALE/O`, `SUK (NAME)` and `TOMAN (NAME)` stay dropped. Any other name with a character outside `A` to `Z`, space, `'` and `-` after normalization is dropped and listed in the script report rather than guessed at.
- Names have no maximum length in this feature; a limit for hand-typed names, if wanted, belongs to 8b.
- The burned registry is one document, not one document per name.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":13822,"specSha256":"d37cd81289d61ac4f0f2504d392e1f3c714db4504a0e191c702681dba72102a8","branch":"refs/heads/feature/name-list-and-registry","head":"7e2f2e4e828a4d2e7bcb4aa5b82f0f1ba7c090cd","baseRef":"refs/heads/main","baseCommit":"7e2f2e4e828a4d2e7bcb4aa5b82f0f1ba7c090cd","sourceTree":"d2bbdc822f7457411722e9ab029b153340989278","landing":"local-merge","absentOptional":[]} -->

## Findings

### 8a/F-01 [P3] closed - Hand-written sort comparators duplicate the default string order

**File:** src/names/normalize-name.ts:41 (also src/names/name-registry.ts:37)
**Found:** 2026-10-13 by /audit (scope: current; lens: quality, security, performance, tests)
**Why it matters:** Both places sort strings with `(a, b) => (a < b ? -1 : a > b ? 1 : 0)`. JavaScript's default `Array.prototype.sort()` already orders strings by UTF-16 code unit, which is the same order for these ASCII names, so the comparators add code and a copy to keep in step.
**Suggested fix:** Use `.sort()` with no argument in both places and keep the existing sorted-order tests as the guard. Nothing is lost.
**Resolution:** Both sorts now use the default `.sort()`; the list regenerates byte-identical and the sorted-order tests pass unchanged. Re-reviewed normalize-name.ts:44 and name-registry.ts:34: both use default `.sort()`, the list is still strictly sorted and unique (62,198 names), no new defect in the sort lines.

### 8a/F-03 [P1] closed - A name ending in a space plus apostrophe normalizes to a name with a trailing space, which makes the burned registry unreadable

**File:** src/names/normalize-name.ts:19
**Found:** 2026-10-13 by /audit (scope: current; lens: quality, security, performance, tests)
**Why it matters:** `normalizeName` trims whitespace and only then removes trailing apostrophes, so `SMITH '` becomes `SMITH ` (checked: `normalizeName("SMITH '")` returns `"SMITH "`, and normalizing that result again returns `"SMITH"`). That breaks the documented contract (no trailing spaces, and `normalizeName(normalizeName(x))` equals the first result). `burnNamesOp` would store `"SMITH "`, and `getBurnedNames` then rejects the whole document because `normalizeName("SMITH ") !== "SMITH "`, so every later burn and read fails and the permanent registry cannot be used. No caller exists yet, but a hand-typed name in feature 8b can reach it. The generated list is not affected (no entry has a trailing space).
**Suggested fix:** Strip trailing apostrophes before the final trim (for example `.replace(/\s+/g, ' ').replace(/'+\s*$/, '').trim()`), or trim once more after stripping. Add tests that `SMITH '` and `O' '` normalize to `SMITH` and `O` and that every normalized result is unchanged by a second `normalizeName`.
**Resolution:** `normalizeName` now removes trailing spaces and apostrophes together before the final trim. Tests cover `SMITH '`, `O' '` and `O'BRIEN' '`, check every example is unchanged by a second normalization, and a burn of `SMITH '` stores and reads back `SMITH`. The list regenerates byte-identical. Re-reviewed normalize-name.ts:11-21 and the registry: a throwaway fuzz run of 200,000 random strings (letters, accents, ligatures, tabs, no-break spaces, apostrophes, hyphens, periods) found no result that changed on a second normalization or had leading, trailing or repeated spaces, and every entry in the committed list is unchanged by normalization (probe deleted afterward). No new defect found.
