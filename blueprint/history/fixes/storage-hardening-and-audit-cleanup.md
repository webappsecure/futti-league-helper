# Fix: Storage hardening and audit cleanup

**Type:** Fix
**Status:** verified
**Branch:** `fix/storage-hardening-and-audit-cleanup`
**Fixes:** F-01, F-02, F-03, F-04, F-05, F-06

## The problem

The full audit raised six open findings in the feature 1 code (`blueprint/context/findings.md`), none blocking but two touching data integrity:

- **F-01 (P2)** `src/storage/init.ts`: a migration's writes and the schema version bump are separate commits, so a crash between them reruns the migration.
- **F-02 (P2)** `src/storage/sqlite-database.ts`: `withTransactionAsync` shares the connection, so concurrent queries can run inside a `batch` transaction and break the all-or-none contract.
- **F-03 (P3)** `package.json`: the starter `reset-project` script can move or delete `src/`.
- **F-04 (P3)** the web tab bar is absolutely positioned, so every screen repeats `TopTabInset`.
- **F-05 (P3)** `src/storage/storage-provider.tsx`: database connections are never closed after a failed init or retry.
- **F-06 (P3)** tests missing for init error paths and neighbouring collection names.

## The fix

Repair the root causes in the order below (recommended order: integrity first, then cleanup, then tests last so they cover the final code). Add no dependency.

- **F-01:** Change `Migration` to `(db) => Promise<Op[]>`: it may read from the database and returns the writes it wants. `initStorage` commits the returned ops together with the new `meta/schema` version in a single `batch`, so data and version change together or not at all. Migrations stay free to be non-idempotent. A fresh install still writes version 1 only.
- **F-02:** In the SQLite backend, run `batch` with `withExclusiveTransactionAsync` (its own connection; queries must use the `txn` object). Enable WAL (`PRAGMA journal_mode = WAL`) when creating the database so reads are not blocked. Serialize `batch` calls through a small in-process promise queue so overlapping batches wait instead of failing with `database is locked`. The queue must continue after a failed batch.
- **F-03:** Remove the `reset-project` entry from `package.json` and delete `scripts/reset-project.js` (and the then-empty `scripts/` folder).
- **F-04:** Make the web tab bar part of normal layout (not absolutely positioned) so content starts below it, then delete `TopTabInset` from `src/constants/theme.ts` and from both screens. Keep the visual look of the bar.
- **F-05:** Add `close(): Promise<void>` to `Database` (memory: no-op; IndexedDB: `db.close()`; SQLite: `closeAsync()`). The provider closes the database when init does not reach `ready` and whenever its effect is cleaned up (unmount or retry), using a locally tracked handle. A cancelled run closes a database it opened late.
- **F-06:** Add tests: `initStorage` returns `error` when the database `get` fails and when the version write fails (stub database); the conformance suite lists correctly with collections `c`, `cc` and `c2`; `close()` resolves on the memory and IndexedDB backends. The SQLite backend stays covered by the manual native check.

Must not break: the `Database` interface contract (never throws, `Result` shape, atomic `batch`), the existing 24 tests, the web export, and feature 1 behavior on both platforms.

## Build steps

- [x] **Step 1 - F-01 atomic migrations** - Change `Migration`, `initStorage`, and the init tests. *Done when:* tests prove migration ops and the version put land together (both visible after success), a batch that fails (unserializable value) leaves data and stored version unchanged and returns `error`, and `npm test`, lint and typecheck pass.
- [x] **Step 2 - F-02 SQLite batch isolation** - Exclusive transaction, WAL, and batch queue in `sqlite-database.ts`. Extract the queue as a pure helper with a unit test (runs in order, keeps going after a rejection, returns each task's result). *Done when:* the queue test passes with lint and typecheck, and the code uses only `txn` inside the transaction. Native behavior is checked in Step 7.
- [x] **Step 3 - F-03 remove reset script** - Delete the script entry and file. *Done when:* `package.json` has no `reset-project`, `scripts/` is gone, and `rg reset-project` finds nothing outside `node_modules`.
- [x] **Step 4 - F-04 tab bar in layout flow** - Rework `app-tabs.web.tsx` and the two screens, remove `TopTabInset`. *Done when:* lint and typecheck pass, `rg TopTabInset src` is empty, and the web export builds. Visual result is checked in Step 7.
- [x] **Step 5 - F-05 close connections** - `close()` on `Database` and its three backends, plus the provider cleanup. *Done when:* typecheck passes and the new close tests (Step 6) can call it on memory and IndexedDB.
- [x] **Step 6 - F-06 tests** - The init failure tests, the collection-name conformance case, and the close tests. *Done when:* `npm test` passes with the new cases.
- [x] **Step 7 - Final checks and manual run** - Run lint, typecheck, tests and `npx expo export --platform web`. The user then checks web (tab bar sits above content on both tabs, Settings still shows schema version, reload keeps data) and the iOS simulator (Settings still shows schema version after force-quit). *Done when:* all automated checks are green and both manual checks pass.

## Verify

- Automated: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npx expo export --platform web`.
- Manual web: `npm run web`; the tab bar no longer overlaps content on Leagues and Settings, in light and dark.
- Manual native: `npm run ios`; the app still opens to the shell and Settings shows the schema version after a force-quit. This is the only check of the SQLite changes (F-02, F-05).
- After the repair, run `/audit current` to review the fix and close F-01 to F-06.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":5723,"specSha256":"1cef5bc2c34c020a6193ee3b2fee6de1bdffbff14b753c4260abcc3cda481fb6","branch":"refs/heads/fix/storage-hardening-and-audit-cleanup","head":"13a6045613403523f446ae3ea6c8f503e0d04d5d","baseRef":"refs/heads/main","baseCommit":"13a6045613403523f446ae3ea6c8f503e0d04d5d","sourceTree":"74f88202233445bce5b9fa134ba3281acefab04e","landing":"local-merge","absentOptional":[]} -->

## Findings

### storage-hardening-and-audit-cleanup/F-01 [P2] closed - Migration writes and the version bump are separate commits

**File:** src/storage/init.ts:45
**Found:** 2026-10-12 by /audit (scope: full; lens: all)
**Why it matters:** `steps[version - 1](db)` writes data, then `writeVersion` is a second batch. A crash or write failure between them leaves migrated data with the old version recorded, so the migration runs again on next launch. Nothing documents that migrations must be idempotent, and the first real migration will touch irreplaceable league history.
**Suggested fix:** Make a migration return its ops (or accept a batch builder) so the data changes and the version put commit in one `batch`. Add a test that a failed batch leaves both unchanged. Alternatively document and test idempotency as the contract.
**Resolution:** Re-reviewed init.ts:35-51: ops and the version put share one batch, a failed batch leaves both unchanged (init.test.ts covers throw and unstorable batch). No new defect.

### storage-hardening-and-audit-cleanup/F-02 [P2] closed - SQLite batch can absorb concurrent queries into its transaction

**File:** src/storage/sqlite-database.ts:44
**Found:** 2026-10-12 by /audit (scope: full; lens: all)
**Why it matters:** `withTransactionAsync` runs on the shared connection, and expo-sqlite documents that other async queries issued meanwhile may execute inside the transaction (SQLiteDatabase.d.ts, near line 90). A concurrent `get`/`list` can read uncommitted rows that are later rolled back, and two overlapping `batch` calls can merge into one transaction, which breaks the "all or none" contract the offseason depends on. Nothing calls it concurrently yet, and the SQLite backend has no automated test, so this is reasoned from the docs, not reproduced.
**Suggested fix:** Use `withExclusiveTransactionAsync` for `batch` (it uses its own connection), or serialize `batch`/reads through a promise queue. Re-check on a simulator.
**Resolution:** Re-reviewed sqlite-database.ts:46-75: batch runs on an exclusive connection behind a serial queue, WAL on, all writes go through batch so none collide with the lock. iOS simulator run passed (user). Residual: no concurrent-load test exists.

### storage-hardening-and-audit-cleanup/F-03 [P3] closed - Starter `reset-project` script can wipe the app

**File:** package.json:43
**Found:** 2026-10-12 by /audit (scope: full; lens: quality)
**Why it matters:** `npm run reset-project` runs `scripts/reset-project.js`, which moves or deletes `src/` and `scripts/` and recreates a blank app. It asks first, but it is a destructive starter leftover that this project never needs, and `AGENTS.md` does not warn about it.
**Suggested fix:** Delete the script entry and `scripts/reset-project.js`. Nothing else uses them.
**Resolution:** Script entry, scripts/reset-project.js and README section are gone; rg finds no remaining reference.

### storage-hardening-and-audit-cleanup/F-04 [P3] closed - Web tab bar offset must be repeated on every screen

**File:** src/app/settings.tsx:47 (also src/app/index.tsx:33, src/constants/theme.ts:65)
**Found:** 2026-10-12 by /audit (scope: full; lens: quality)
**Why it matters:** The web tab list is absolutely positioned, so each screen adds `TopTabInset` (a hard-coded 72) to its own padding. Features 3 to 14 add many screens, and a missed inset hides content under the bar. The 72 is also not tied to the tab bar's real height.
**Suggested fix:** Apply the inset once in a shared screen wrapper (or in `app-tabs.web.tsx` around `TabSlot`) and drop it from individual screens.
**Resolution:** rg TopTabInset src is empty; app-tabs.web.tsx lists TabList before TabSlot (flex 1); user confirmed web layout.

### storage-hardening-and-audit-cleanup/F-05 [P3] closed - Database connection is never closed after a failed init or retry

**File:** src/storage/storage-provider.tsx:43
**Found:** 2026-10-12 by /audit (scope: full; lens: quality, performance)
**Why it matters:** `openDatabase()` opens an IndexedDB connection or SQLite handle on every attempt. If `initStorage` returns `error` or `newer-version`, the handle stays open, and each Retry opens another. A leaked IndexedDB connection can also block a later version upgrade from another tab. Impact is small today because there is one schema version.
**Suggested fix:** Add an optional `close()` to `Database`, call it when init does not reach `ready` and on provider unmount.
**Resolution:** Re-reviewed storage-provider.tsx:42-80: close-once guard covers failed init, retry, unmount and a late open after cancel. Provider logic itself is untested, see F-07.

### storage-hardening-and-audit-cleanup/F-06 [P3] closed - Test gaps: init failure paths and neighbouring collection names

**File:** src/storage/init.test.ts:1 (also src/storage/database.test.ts:1)
**Found:** 2026-10-12 by /audit (scope: full; lens: tests)
**Why it matters:** `initStorage` returns `error` when `db.get` or the version write fails, and neither path is tested. The IndexedDB `list` key range `[collection, ''] .. [collection, []]` is only tested against an unrelated collection name, so a bug mixing `c` and `cc` or `c2` would pass. The SQLite backend has no automated test at all (known, covered by a manual check).
**Suggested fix:** Add a failing-database stub to the init tests, and a conformance case that writes collections `c`, `cc` and `c2` and checks `list('c')`.
**Resolution:** init.test.ts covers read and write failure, database.test.ts covers c/cc/c2 and close on memory and IndexedDB.
