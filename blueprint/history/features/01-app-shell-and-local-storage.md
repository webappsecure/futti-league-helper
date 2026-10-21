# Feature: App shell and local storage

**From build-plan:** feature 1
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/app-shell-and-local-storage`

## Goal

Replace the Expo starter with the Fütti app shell: a tablet-first navigation and master-detail layout, light/dark theme, and a versioned local database layer that works on iPad, Android and the web build (SQLite on native, IndexedDB on web, one shared interface). Also establish working lint, typecheck and unit test commands so every later feature has a real gate.

## In scope

- Lint and typecheck both pass on the repository (baseline repair, see Notes)
- Unit test runner (jest-expo) with a `test` script, in `AGENTS.md` Commands
- Database layer in `src/storage/`: one `Database` interface (document store with atomic multi-write), a SQLite backend for native (`expo-sqlite`), an IndexedDB backend for web, an in-memory backend for tests, schema version record, ordered migration runner, safe handling of corrupt or newer-than-app data
- Request persistent storage on web (`navigator.storage.persist()`) after storage is ready, and show the result in Settings
- App startup that initializes storage before rendering the shell, with loading and error (retry) states
- Shell: two tabs (Leagues, Settings), responsive master-detail primitive (two panes at tablet/desktop width, single pane on narrow), Leagues empty state, Settings screen showing app and data schema versions
- Remove starter demo content (Expo welcome screen, hint rows, animated icon, explore screen, web badge) that the shell replaces
- Light/dark theme continues to follow the system via the existing theme tokens

## Out of scope

- Any league, team, player or season data (features 3 onward)
- Export/import (feature 9), name list (feature 8)
- Team colors theming (feature 4)
- CI workflow and a combined Verify command (`/ci`)
- Browser test harness (`/tests browser`)
- Web hosting setup and PWA install

## Build loop

Build one small step at a time. Follow `workflow.stepReview` in `blueprint/config.json`: `feature` produces one review packet after all steps. Checkpoint commits are disabled. `/complete` makes the final feature commit. Never accept a review packet you have not read; split any diff that is too large to review.

## Build steps

- [x] **Step 1 - Lint and typecheck baseline** - Make `npm run lint` and `npx tsc --noEmit` pass on the current starter. Lint currently fails because ESLint is not set up (`expo lint`); typecheck currently reports missing `expo-env.d.ts` and CSS module declarations. Use `npx expo install` for any package, follow the SDK 57 docs. *Done when:* both commands exit 0 with no errors.
- [x] **Step 2 - Test runner and database layer** - Add jest-expo, a `test` script, and the database module (see Data / contracts): interface, memory backend, IndexedDB backend (tested with `fake-indexeddb`), SQLite backend, platform entry files `database.ts` (SQLite) and `database.web.ts` (IndexedDB), and the init/migration runner. Remove the AsyncStorage dependency added earlier. Add `test` to the Commands section of `AGENTS.md`. *Done when:* `npm test` passes with one shared conformance suite run against the memory and IndexedDB backends (get/put/delete round trip, missing document, list a collection, atomic `batch` that applies all or none, JSON values preserved) plus init tests (fresh install, migration order, newer-version refusal, migration failure, invalid stored version); lint and typecheck pass. The SQLite backend has no automated test and is checked on a device or simulator in Step 5.
- [x] **Step 3 - Storage bootstrap at startup** - Initialize storage in a provider used by the root layout. While initializing show a loading state; on failure show an error message with a retry button; a newer-than-app schema shows a specific message and never writes. Expose the schema version through a hook, and give the provider the platform `Database` from `database.ts`. On web, after a successful init, request persistent storage (pure helper in `src/storage/persistence.ts`, tested with a fake manager: unsupported, already persistent, granted, denied, thrown error) and show "Protected storage: Yes / No / Not applicable" in Settings with a short warning when No. *Done when:* the app starts to the shell on a fresh install, shows the error state when init is forced to fail (verified by a temporary local throw, removed afterward), and tests for the init result handling pass.
- [x] **Step 4 - Shell, master-detail and screens** - Replace the starter tabs with Leagues and Settings. Build the `MasterDetail` primitive (pure width breakpoint function, unit tested, two panes at 768 dp wide or more, otherwise single pane) and use it on Leagues with an empty state ("No leagues yet"). Settings shows the app version and data schema version. Delete starter demo screens and components no longer used. Keep native tabs on native and the existing custom tab bar on web, renamed to the new tabs. *Done when:* `npm run web` shows the shell with both tabs in light and dark; resizing the browser across 768 px switches pane layout; lint, typecheck and tests pass.
- [x] **Step 5 - Persistence across reload and web build** - Verify storage actually persists on both backends. Settings shows the stored schema version read from the database. On web, reload and confirm the value survives; run `npx expo export --platform web` and confirm it builds. On native, run the app in an iOS simulator or Android emulator or device, confirm Settings shows the schema version, force-quit and reopen, and confirm it still shows it (this is the only check of the SQLite backend). *Done when:* the web database survives reload (IndexedDB `futti` database visible in devtools), the web export completes, the native app shows the schema version after a restart, and the final lint, typecheck and test run is green.

## Files / areas

- `package.json`, `eslint.config.js` (if the setup needs it), jest config
- `src/storage/` (new): database interface, memory/IndexedDB/SQLite backends, platform entry files, init and migrations, persistence helper, tests
- `src/app/_layout.tsx`, `src/app/index.tsx`, new `src/app/settings.tsx`; remove `src/app/explore.tsx`
- `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`
- New `src/components/master-detail.tsx` and a breakpoint helper with test
- Remove unused starter components (`animated-icon*`, `hint-row`, `web-badge`, `collapsible`, `external-link` if nothing uses it)
- `AGENTS.md` Commands (add `test`, typecheck already listed)

## Data / contracts

- Backends: `expo-sqlite` on native (stable on iOS and Android) and the browser's IndexedDB on web (no dependency, no 5 MB cap, transactional). The web SQLite build is alpha in SDK 57 and needs WASM Metro config plus COOP/COEP headers, so it is not used. Metro platform extensions pick the backend: `database.ts` (SQLite) and `database.web.ts` (IndexedDB). Unit tests import backends directly and never load `expo-sqlite`. `fake-indexeddb` is a dev dependency for testing the web backend.
- Interface (document store, all values JSON-serializable): `get(collection, id)`, `list(collection)`, `batch(ops)` where ops are `put` and `delete` on `(collection, id)` and a batch is atomic (all applied or none, one SQLite transaction or one IndexedDB transaction). A single put/delete is a batch of one. Returns `{ ok: true, value }` or `{ ok: false, error }`; it never throws and never deletes data on a read failure. Queries beyond `list` are done in code; SQL-level querying is not part of the interface.
- SQLite schema: one table `docs(collection TEXT, id TEXT, json TEXT, PRIMARY KEY (collection, id))` in database file `futti.db`. IndexedDB: database `futti`, one object store `docs` with key `[collection, id]`.
- Meta document: collection `meta`, id `schema`, value `{ schemaVersion: number }`. Current version is 1.
- Init: no meta document means fresh install, so write `{ schemaVersion: 1 }`. Lower version runs `migrations` in order, one version at a time, writing the new version after each success. Higher than the app's version returns a `newer-version` error and writes nothing. A failing migration stops and leaves the stored version at the last completed step. A migration receives the `Database`.
- `migrations` starts empty; version = 1 + migrations.length.
- Repository layer (`leagues`, `players`, `seasons`) is not built here; later features add repositories over `Database`, and an offseason is written as one `batch`.

## Testing

- A test runner is added in Step 2, so tests are a gate from then on. Logic to test: the shared backend conformance suite (memory and IndexedDB via `fake-indexeddb`), init (fresh, migrate, newer-version, migration failure, invalid version), the persistence helper, and the master-detail breakpoint function.
- UI (tabs, master-detail rendering, loading/error views, Settings) is verified by running the web build and the checks in each step, not unit tests.
- No browser test harness exists; evidence is the dev server and `npx expo export --platform web`. The SQLite backend has no automated test; Step 5 checks it manually on a simulator, emulator or device.

## Notes for the AI

- Expo SDK 57: read the matching versioned docs before using any Expo or React Native API (see `AGENTS.md`). Use `npx expo install` for packages.
- Baseline observed on `main`: `npx tsc --noEmit` reports 2 errors (`animated-icon.module.css` and `@/global.css` declarations, caused by the missing generated `expo-env.d.ts`); `npm run lint` fails because ESLint is not installed or configured. There is no Verify command. Fix these in Step 1 only, without unrelated changes.
- Keep rule and storage logic in pure functions with no UI imports so later features can test them.
- Follow `blueprint/context/coding-standards.md`: strict TypeScript, no `any`, kebab-case filenames, `@/` imports, minimal comments, no em dashes.
- Do not start the shell design beyond what is listed; league, team and player UI belong to later features.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":10053,"specSha256":"b3075661c0e65f685e4c3c14f80c9a2002dfe941b0f069c9aea159154f8d9597","branch":"refs/heads/feature/app-shell-and-local-storage","head":"5f3f1447aa265d3bf195344b7b2edd450d70de70","baseRef":"refs/heads/main","baseCommit":"5f3f1447aa265d3bf195344b7b2edd450d70de70","sourceTree":"e11986d14481167a33c91135c93e12a3ff0245cf","landing":"local-merge","absentOptional":[]} -->
