# Fix: Provider lifecycle test and README

**Type:** Fix
**Status:** verified
**Branch:** `fix/provider-lifecycle-test-and-readme`
**Fixes:** F-07, F-08

## The problem

Two open P3 findings from the last audit:

- **F-07** `src/storage/storage-provider.tsx`: the open, init and close sequence (failed init, retry, unmount, late open after cancel) lives inside a React effect and has no automated test. The `close()` tests only assert that it resolves.
- **F-08** `README.md`: it is still the stock Expo welcome text, and its "Other setup steps" tell readers to set up ESLint and Jest, which are already configured.

## The fix

- **F-07:** Move the sequence into a plain async helper `startStorageSession(open, init = initStorage)` in a new `src/storage/session.ts`. It opens the database, runs init, and returns `{ result, database, close }`. `database` is the open database only when the result is `ready`, otherwise `null` and the database has already been closed. `close()` is idempotent and closes the database at most once. If `open` itself fails, return an `error` result with no database. The provider effect keeps the returned session, calls `session.close()` in its cleanup, and calls it when the session arrives after the effect was cancelled. No behavior change otherwise.
- **F-08:** Replace `README.md` with a short project description (what Fütti and the app are, local-first, tablet-first, web build in a browser) and the real commands from `AGENTS.md` (install, start, ios, android, web, lint, typecheck, test). No em dashes. Do not describe unbuilt features as available.

Must not break: provider behavior (loading, ready, newer-version, error with retry), the existing 33 tests, the web export, native startup.

## Build steps

- [x] **Step 1 - F-07 session helper and tests** - Add `session.ts`, switch the provider to it, add `session.test.ts` with a fake database (a counter on `close`). Cases: ready keeps the database open and returns it until `close()`; init `error` closes the database and returns `database: null`; `newer-version` closes it too; `open` rejecting returns an `error` result and calls nothing else; `close()` called twice closes once; a session closed straight after it resolves (the late-open case) closes once. *Done when:* `npm test` passes with the new cases, lint and typecheck pass, and the provider has no direct `openDatabase`/`close` bookkeeping left.
- [x] **Step 2 - F-08 README** - Rewrite `README.md` as described. *Done when:* every command listed exists in `package.json` or `AGENTS.md`, and no reference to resetting the project or setting up ESLint or Jest remains.
- [x] **Step 3 - Final checks and manual run** - Run lint, typecheck, tests and `npx expo export --platform web`. Then the user opens the app (web and iOS) to confirm it still starts to the shell and Settings shows the schema version. *Done when:* all automated checks are green and the user confirms both runs.

## Verify

- Automated: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npx expo export --platform web`.
- Manual: `npm run web` and `npm run ios`; the app loads to the Leagues tab and Settings shows "Data schema version: 1". Retry behavior can be seen by temporarily making `initStorage` fail (remove the throw afterward).
- Afterward, `/audit current` to close F-07 and F-08.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":3319,"specSha256":"69b9474577a40b8a56cefad4f462b02475fa92ca6a24d69525e4f6574f64edcf","branch":"refs/heads/fix/provider-lifecycle-test-and-readme","head":"1cc54790cce6e134103fdb22b8df4a7e4740bafc","baseRef":"refs/heads/main","baseCommit":"1cc54790cce6e134103fdb22b8df4a7e4740bafc","sourceTree":"2fd7b4fe1e3cfc2225a9f26fe73bbce948cc9907","landing":"local-merge","absentOptional":[]} -->

## Findings

### provider-lifecycle-test-and-readme/F-07 [P3] closed - Provider connection lifecycle has no automated test

**File:** src/storage/storage-provider.tsx:43
**Found:** 2026-10-13 by /audit (scope: current; lens: tests)
**Why it matters:** The close-once logic for failed init, retry, unmount and a late open after cancel (the F-05 repair) is the subtle part of the provider, and only a manual run exercises it. The `close()` tests only assert that it resolves, so a regression such as leaking a connection or closing twice would pass.
**Suggested fix:** Move the open, init and close sequence into a small pure async helper that takes the open function, and unit test it with a fake database (init error closes, late open after cancel closes once, ready stays open until cleanup).
**Resolution:** Re-reviewed session.ts and storage-provider.tsx:42-66: close-once is enforced in the helper (failed init, newer-version, throw, open failure, repeated close all tested) and the provider only calls session.close() on cleanup or a late arrival. Residual: that two-line wiring is not unit tested (UI effect).

### provider-lifecycle-test-and-readme/F-08 [P3] closed - README still tells readers to set up ESLint and unit testing

**File:** README.md:28
**Found:** 2026-10-13 by /audit (scope: current; lens: quality)
**Why it matters:** The "Other setup steps" list says to set up ESLint and Jest, both already configured, and the rest of the file is still the stock Expo welcome text, so a new reader gets wrong instructions. This fix edited that file.
**Suggested fix:** Replace the README with a short project description and the real commands from AGENTS.md (start, lint, typecheck, test).
**Resolution:** README.md now describes the project and lists only commands present in package.json; no reset, ESLint or Jest setup text remains.
