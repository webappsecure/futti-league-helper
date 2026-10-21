# Feature: League management

**From build-plan:** feature 3
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/league-management`

## Goal

Let the commissioner create, view, edit and delete leagues from the Leagues tab, with the settings the plans define: name, size, team naming style, and relegation settings. Leagues are saved in the local database so they survive restarts. This is the first real screen of the app and the first data the commissioner owns, so it also establishes how features read and write documents through the storage layer.

## In scope

- League model with validation: name, size (6, 8, 10, 12, 14, 16, 18, 20), naming style (`cityAndName` or `nameOnly`), relegation on or off, promoted count and demoted count (independent)
- League repository over the `Database` interface: list, get, create, update, delete
- Leagues screen: list of leagues, selected league details, create form, edit form, delete with an explicit confirmation step
- Loading, empty, load-error (with retry), save-error and "some saved leagues could not be read" states
- Narrow layout: list and detail swap with a Back control; wide layout: list and detail side by side
- Unit tests for validation and the repository

## Out of scope

- Teams, colors, grades and rosters (features 4, 6, 7)
- Linking leagues and enforcing matching counts or naming style across leagues (feature 5)
- Divisions and conferences (not in v1; this feature adds no placeholder field)
- Locking the size or settings once teams exist (decided when teams exist, feature 4 onward)
- Deleting dependent teams, rosters or seasons with a league (none exist yet; features 4 onward must cascade their own data)
- Export/import, names, seasons

## Build loop

Build one small step at a time. Follow `workflow.stepReview` in `blueprint/config.json`: `feature` produces one review packet after all steps. Checkpoint commits are disabled. `/complete` makes the final feature commit. Never accept a review packet you have not read; split any diff that is too large to review.

## Build steps

- [x] **Step 1 - League model and validation** - `src/leagues/league.ts`: the `League` and `LeagueInput` types, `LEAGUE_SIZES`, `validateLeagueInput(input)` returning field errors, and `createLeagueId()` (timestamp plus random base-36 text, with injectable clock and random source). Rules: name trimmed, 1 to 60 characters; size one of the eight sizes; naming style one of the two values; promoted and demoted counts are whole numbers from 0 to the league size; when relegation is on they must not both be 0 (at least one team moves each season, up or down); both are forced to 0 when relegation is off. *Done when:* `league.test.ts` passes covering each field's valid and invalid values (empty and whitespace name, 61-character name, size 7 and 22, unknown style, counts of -1, 1.5 and size + 1, relegation on with both counts 0 rejected while 1 and 0 or 0 and 1 are accepted, counts reset when relegation is off, trimmed name stored), and that ids are strings that differ between calls and are reproducible with injected clock and random; lint and typecheck pass.
- [x] **Step 2 - League repository** - `src/leagues/league-repository.ts` over `Database`, collection `leagues`, document id equal to `League.id`. Functions: `listLeagues(db)` (sorted by name ignoring case, then id; returns `{ leagues, unreadable }` where `unreadable` counts stored documents that are not valid leagues), `getLeague(db, id)`, `createLeague(db, input)`, `updateLeague(db, id, input)`, `deleteLeague(db, id)`. Create and update validate first and return a failure carrying the field errors; update of a missing league fails without writing; delete of a missing league succeeds. *Done when:* `league-repository.test.ts` passes on the in-memory database covering create then list and get, sort order including case, update changing settings, update of a missing id, validation failure writing nothing, delete, delete of a missing id, and an invalid stored document counted as unreadable and not listed; lint and typecheck pass.
- [x] **Step 3 - Leagues list and details (read-only)** - `src/leagues/use-leagues.ts` loads leagues with `useDatabase()` and exposes `{ status, leagues, unreadable, reload }`. Build `LeagueList` and `LeagueDetail` components under `src/components/leagues/` and rewire `src/app/index.tsx` to show them in `MasterDetail`: loading text, empty state ("No leagues yet" with a New league button that does nothing yet), error state with Retry, a list row per league, and a details pane showing every setting in plain words. Selecting a league shows it; on narrow screens a Back button returns to the list. Show a short warning line when `unreadable` is above 0. *Done when:* lint, typecheck and tests pass, and with a league written through the repository (a temporary seed removed afterward) the user sees it in the list and its details on web and iOS.
- [x] **Step 4 - Create and edit form** - `LeagueForm` with a text field for the name, a row of eight size choices, two naming-style choices, a relegation switch, and promoted and demoted number fields shown only when relegation is on. No size or naming style is preselected for a new league; relegation starts off. Field errors appear under each field and are announced (alert role), the form stays open on a validation or save error with the text kept, saving disables the button while it runs, and Cancel returns without saving. New league and Edit buttons open it. After saving, the list reloads and the saved league is selected. *Done when:* lint, typecheck and tests pass, and on web the user creates a league, sees it listed, edits its name and relegation counts, restarts the app, and sees the saved values; submitting an empty name shows the error and writes nothing.
- [x] **Step 5 - Delete with confirmation** - A Delete button in the details pane switches that pane to an inline confirmation ("Delete <name>? This cannot be undone." with Delete and Cancel). Cancel returns to the details. Confirming deletes the league, reloads the list and clears the selection. A failed delete shows the error and keeps the league. The confirmation is inline (not `Alert.alert`) because alerts do not work on web. *Done when:* lint, typecheck and tests pass, and on web and iOS the user deletes a league only after confirming, Cancel keeps it, and the league is gone after a restart.
- [x] **Step 6 - Final checks and manual run** - Run lint, typecheck, tests and `npx expo export --platform web`. The user then runs the app on web and iOS through create, edit, delete, restart, light and dark mode, and the narrow and wide layouts. *Done when:* all automated checks are green and the user confirms both platforms.
- [x] **Step 7 - Repair audit findings F-01 and F-02** - F-01: add a small latest-only guard (`src/leagues/latest-only.ts`) and use it in `use-leagues.ts` so an older load can never overwrite a newer list (the first load and `refresh()` each take a token; only the latest token's result is applied; unmount cancels). F-02: use `Accent.danger` for error text in `league-form.tsx` and `league-detail.tsx`, set the name field's `maxLength` to `NAME_MAX_LENGTH`, and share one `onSaved` handler between the create and edit branches in `src/app/index.tsx`. *Done when:* `latest-only.test.ts` passes (a started task is latest until another starts, an older token reports not latest, cancel invalidates every token, tokens from a later start stay valid), `rg "d92d20" src` finds only the `Accent` definition, F-01 and F-02 are marked `fixed`, and lint, typecheck and `npm test` pass.

## Files / areas

- New `src/leagues/league.ts`, `league-repository.ts`, `use-leagues.ts` and tests for the first two
- New `src/components/leagues/league-list.tsx`, `league-detail.tsx`, `league-form.tsx`
- Changed `src/app/index.tsx` (Leagues screen); existing `master-detail.tsx`, `themed-text.tsx`, `themed-view.tsx` and `storage-provider.tsx` (`useDatabase`) are reused as they are
- No change to the storage layer, schema version or dependencies

## Data / contracts

- Persisted in the existing database, collection `leagues`, one document per league, document id = `League.id`. No migration: a new collection needs none, and the schema version stays 1.
- `League`: `{ id: string; name: string; size: 6|8|10|12|14|16|18|20; namingStyle: 'cityAndName' | 'nameOnly'; relegation: boolean; promotedCount: number; demotedCount: number }`. `id` is generated once at create (`createLeagueId()`, format `<time base-36>-<random base-36>`), is unique in practice for a single local user, and never changes. Counts are whole numbers from 0 to `size`; with `relegation` true, `promotedCount + demotedCount` is at least 1; both are 0 when `relegation` is false. `name` is stored trimmed, 1 to 60 characters; names need not be unique.
- Later fields are optional additions to the same document (for example `leagueAboveId`, `leagueBelowId`, divisions), so existing documents stay valid and no migration is needed for them.
- Repository results use the storage layer's `Result` style: success carries the value, failure carries either field errors (`{ kind: 'validation', fields }`) or the storage `Error`. Validation failures never write. Update and create write one document in one `batch`; delete removes one document in one `batch`.
- A stored document that is not a valid league is never listed, never modified, and is counted so the UI can warn; the repository does not delete it.
- Rendering: names are plain text rendered through `Text`, never interpreted as markup.

## Testing

- `npm test` is a gate. Logic to test: validation, id generation and the repository (sorting, create, update, delete, missing ids, unreadable documents).
- UI is verified by hand on web and iOS (steps 3 to 6); there is no browser test harness. Nothing here claims visual or persisted-restart evidence until the user runs it.
- The SQLite and IndexedDB backends are already covered by feature 1; this feature relies on the `Database` interface only.

## Notes for the AI

- Expo SDK 57: check versioned docs before using Expo or React Native APIs. Use plain React Native components (`TextInput`, `Pressable`, `Switch`) and the existing themed components.
- Accessibility: every input has a visible label and `accessibilityLabel`; error text is rendered next to its field with an alert role; choice buttons expose selected state (`accessibilityState`) and a role.
- Keep rules and repository code free of React so they stay unit-testable. Do not add a state library or a form library; local component state is enough.
- Follow `blueprint/context/coding-standards.md`: strict TypeScript, no `any`, kebab-case files, `@/` imports, minimal comments, no em dashes.

## Decisions

Answered by the user:

- A relegation league must move at least one team each season: promoted plus demoted is at least 1. In a linked pair, the upper league has 0 promoted and the lower league has 0 demoted. The maximum for each count is the league size; no tighter limit is wanted.
- Team names must be unique within a league, and across both leagues when two leagues are linked. City names may repeat (Manchester City and Manchester United share the city Manchester). This does not apply to feature 3; it is enforced when teams exist (feature 4) and when leagues are linked (feature 5). Teams moving between unlinked leagues in the offseason (feature 11) need a collision check.

Chosen here, open to change:

- A relegation league with a count above 0 is valid on its own; whether a count is satisfiable (a league to receive or send teams) is checked in feature 5.
- No size or naming style is preselected for a new league, so the commissioner always chooses them. Relegation starts off.
- League size and settings stay editable for now. Whether to lock them once teams exist is decided with feature 4.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":11872,"specSha256":"6286292a0d7e9e780e2b7fd6ec2581aacfb77cac8846f92b612906c1930ce927","branch":"refs/heads/feature/league-management","head":"2b3c0f0403c5d4cf5f19574b233d6558ceb53357","baseRef":"refs/heads/main","baseCommit":"2b3c0f0403c5d4cf5f19574b233d6558ceb53357","sourceTree":"664eaa2160e12f513725d5a53c1025257405e1fd","landing":"local-merge","absentOptional":[]} -->

## Findings

### 3/F-01 [P3] closed - A slow first load can overwrite a newer list

**File:** src/leagues/use-leagues.ts:26
**Found:** 2026-10-13 by /audit (scope: current; lens: quality, performance)
**Why it matters:** The first load (effect) and `refresh()` (called after a save or delete) both set the list state with no ordering guard, and New league is enabled while the first load is still running. If a save and its `refresh()` finish before the slower first load resolves, the stale first result overwrites the list, so a just-saved league vanishes until the next reload. The window is a few milliseconds on local storage today, but it grows with larger data.
**Suggested fix:** Give each load a sequence number and ignore a result that is not the latest, or disable New league and Edit until the first load finishes.
**Resolution:** Re-reviewed use-leagues.ts:26-45 and latest-only.ts: the first load and every refresh take a token and only the newest applies its result; unmount and retry cancel older ones; latest-only.test.ts covers the guard. Residual: the hook wiring itself has no automated test (UI hook).

### 3/F-02 [P3] closed - Small consistency leftovers in the league UI

**File:** src/components/leagues/league-form.tsx:203 (also league-detail.tsx:82, league-form.tsx:96, src/app/index.tsx:60 and :71)
**Found:** 2026-10-13 by /audit (scope: current; lens: quality)
**Why it matters:** The error color `'#d92d20'` is hard-coded twice although `Accent.danger` holds the same value, so a theme change would miss them. The name field uses `maxLength={NAME_MAX_LENGTH + 20}` with no explanation, which lets people type past the 60-character limit and then see an error. The create and edit branches in the Leagues screen repeat the same `onSaved` handler.
**Suggested fix:** Use `Accent.danger` for error text, either use `NAME_MAX_LENGTH` for `maxLength` or keep the slack with a one-line reason, and share one `onSaved` handler between the two branches.
**Resolution:** Re-reviewed the league UI files: error text uses Accent.danger (no other #d92d20 in src), the name field maxLength is NAME_MAX_LENGTH, and index.tsx shares one saved handler. No new defect found.
