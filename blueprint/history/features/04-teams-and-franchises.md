# Feature: Teams and franchises

**From build-plan:** feature 4
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/teams-and-franchises`

## Goal

Let the commissioner add, view, edit and remove the teams of a league from the league's details pane: city, name, primary and secondary colors chosen with a color picker, and an initial grade. Each team is stored as a franchise with a per-season identity record, so later features can change a team's city, name or colors for a future season while earlier seasons keep the old look. Rosters, linking and seasons stay out; this feature only creates the teams that feature 6 will fill.

## In scope

- Franchise model: `id`, `leagueId`, `initialGrade` (A, B, C, D or F, reusing `Grade` from `src/rules/charts.ts`) and an `identities` list; the first identity has `fromSeason` 1 and holds city, name, primary color and secondary color
- Validation: city and name trimmed, 1 to 60 characters each (city and name are both required in every league, including name-only leagues); colors are `#rrggbb` hex stored lowercase; grade is one of the five letters
- Team name uniqueness within one league (trimmed, case-insensitive). City names may repeat. Cross-league uniqueness waits for feature 5
- A league holds at most `size` teams; adding past the size is refused
- A league cannot be edited to a size smaller than its current team count (field error on the size choice)
- Franchise repository over `Database`: list teams of a league, create, update, delete; deleting a league also deletes its franchises in the same batch
- Teams section inside the league details pane: "n of size teams" count, a row per team with color swatches and its display name (city plus name, or name only, per the league's naming style), empty state, loading and error states
- Add and edit team form: city, name, primary color, secondary color, initial grade
- Color picker: a fixed palette of swatches plus a hex text field, no new dependency; the chosen swatch shows selected state, and an invalid hex shows a field error
- Delete a team with an inline confirmation; league delete confirmation text mentions that its teams are deleted too
- Unit tests for validation, display name, uniqueness, and the repository (including the cascade and the size guard)

## Out of scope

- Linked leagues and cross-league name uniqueness (feature 5)
- Generating rosters, players, dice results or rerolls (feature 6) and accepting a league (feature 7)
- Seasons, `TeamSeason` and the season archive (feature 10); no season record is created here
- Editing identity for a future season, picking a different `fromSeason`, or any UI for more than the first identity (offseason, features 11 to 13)
- Random city or name generation and the name registry (feature 8); city and name are typed by hand
- Moving a team between leagues, promoted and demoted team handling (feature 11)
- Export and import (feature 9)

## Build loop

Build one small step at a time. Follow `workflow.stepReview` in `blueprint/config.json`: `feature` produces one review packet after all steps. Checkpoint commits are disabled. `/complete` makes the final feature commit. Never accept a review packet you have not read; split any diff that is too large to review.

## Build steps

- [x] **Step 1 - Franchise model and validation** - `src/teams/franchise.ts` (pure, no React): `Franchise`, `FranchiseIdentity` and `FranchiseInput` types, `PALETTE` (12 `#rrggbb` swatches), `normalizeHexColor(text)` (accepts `#rgb` or `#rrggbb` with or without the `#`, any case; returns lowercase `#rrggbb` or null), `validateFranchiseInput(input)` returning field errors (`city`, `name`, `primaryColor`, `secondaryColor`, `initialGrade`), `displayName(identity, namingStyle)`, `findDuplicateName(teams, name, exceptId?)`, and `isFranchise(value)` for stored documents. Move the id generator out of `league.ts` into `src/leagues/ids.ts` as `createId`, with `createLeagueId` kept as an alias so existing callers and tests stay valid; franchises use `createId`. *Done when:* `franchise.test.ts` passes covering empty, whitespace and 61-character city and name, trimming, hex inputs `#FFF`, `fff`, `#A1B2C3`, `#12345`, `red` and empty, a missing grade and grade `E`, display name in both naming styles, duplicate names ignoring case and surrounding spaces, the same city allowed, `exceptId` allowing an unchanged name on edit, and `isFranchise` rejecting malformed documents; the existing `league.test.ts` still passes; lint and typecheck pass.
- [x] **Step 2 - Franchise repository and league guards** - `src/teams/franchise-repository.ts`, collection `franchises`, document id equal to `Franchise.id`, using the same result style as `league-repository.ts`. Functions: `listFranchises(db, leagueId)` (sorted by display name ignoring case, then id; returns `{ teams, unreadable }`), `createFranchise(db, league, input)`, `updateFranchise(db, league, id, input)`, `deleteFranchise(db, id)`. Create and update validate first, refuse a duplicate team name in the league, refuse create when the league already has `size` teams, and update of a missing id fails without writing. Update `deleteLeague` so it deletes the league and its franchises in one `batch`, and `updateLeague` so a `size` below the current team count fails with a `size` field error and writes nothing. *Done when:* `franchise-repository.test.ts` and updated `league-repository.test.ts` pass on the in-memory database covering create then list, sort order, teams of other leagues not listed, duplicate name refused on create and on edit to another team's name, unchanged name allowed on edit, full league refused, update of a missing id, validation failure writing nothing, delete, delete of a missing id, an invalid stored document counted as unreadable, league delete removing only its own franchises, and league size reduction refused below the team count but allowed at or above it; lint and typecheck pass.
- [x] **Step 3 - Teams list in the league details pane (read-only)** - `src/teams/use-franchises.ts` (loads one league's teams with `useDatabase()`, same latest-only guard and `{ state, refresh, retry }` shape as `use-leagues.ts`) and `src/components/teams/team-list.tsx`, rendered inside `LeagueDetail` below the settings card. Shows "Teams: n of size", loading text, an error with Retry, an empty state ("No teams yet") and a row per team with two color swatches, the display name for the league's naming style, and the grade; a short warning when `unreadable` is above 0. An "Add team" button is present but disabled when the league is full and does nothing yet. Team names render as plain text. *Done when:* lint, typecheck and tests pass, and with a franchise written through the repository (a temporary seed removed afterward) the user sees it listed under the right league and not under another, on web and iOS.
- [x] **Step 4 - Add and edit team form with color picker** - `src/components/teams/team-form.tsx` and `src/components/teams/color-picker.tsx`. Fields: city, name, primary color, secondary color, initial grade (five `ChoiceButton`s, none preselected). The color picker shows the palette swatches as radio choices plus a hex text field; picking a swatch fills the hex field, typing a valid hex selects the matching swatch or shows a custom swatch, and an invalid hex shows an error under the field. Field errors are announced with the alert role and the form keeps its text on a validation or save error (including "A team with this name already exists in this league."); Save is disabled while saving; Cancel returns without saving. Add team opens it empty, each team row gets an Edit button that opens it filled. After saving, the list refreshes. *Done when:* lint, typecheck and tests pass, and on web the user adds a team, sees it in the list with its colors and grade, edits its name and colors, restarts the app and sees the saved values; an empty city, a bad hex, a missing grade and a duplicate name each show an error and write nothing; Add team is disabled at the league size.
- [x] **Step 5 - Remove a team and league delete wording** - A Delete button on a team opens an inline confirmation ("Delete <display name>? This cannot be undone." with Delete and Cancel, not `Alert.alert`); Cancel keeps the team, a failed delete shows the error and keeps the team, success refreshes the list and the Add team button re-enables. The league delete confirmation in `league-detail.tsx` says its teams are deleted too when it has any. The league size choices in `league-form.tsx` surface the repository's size error when a smaller size is refused. *Done when:* lint, typecheck and tests pass, and on web and iOS the user deletes a team only after confirming, deleting a league removes its teams (they are gone after a restart and do not show under another league), and editing a league with 10 teams to size 8 shows the size error while size 10 or 12 saves.
- [x] **Step 6 - Final checks and manual run** - Run lint, typecheck, `npm test` and `npx expo export --platform web`. The user then runs web and iOS through add, edit, delete, a full league, duplicate names, a name-only league versus a city-and-name league, restart, light and dark mode, and the narrow and wide layouts. *Done when:* all automated checks are green and the user confirms both platforms.
- [x] **Step 7 - Wheel color picker** - Add `reanimated-color-picker` (installed with `npx expo install`; its peers `react-native-reanimated` and `react-native-gesture-handler` are already installed) and wrap the app in `GestureHandlerRootView` in `src/app/_layout.tsx`. In `color-picker.tsx`, keep the swatch row and hex field and add a "Show color wheel" toggle that reveals a `Panel1` and `HueSlider`; releasing the thumb (`onCompleteJS`) writes a lowercase `#rrggbb` into the same value the swatches and hex field use, and the wheel follows swatch or hex changes. Stored colors stay `#rrggbb`. *Done when:* lint, typecheck, tests and `npx expo export --platform web` pass, and the user confirms on web and iOS that the wheel opens, dragging it changes the preview and hex field, swatches and typed hex still work, and the saved color is correct after restart.
- [x] **Step 8 - Repair audit findings F-01 and F-02** - F-01: in `franchise-repository.test.ts`, seed a franchise with a second identity (`fromSeason: 2`) through `db.batch`, call `updateFranchise`, and assert the first identity changed while the second is untouched. F-02: add an optional `accessibilityLabel` prop to `Button` in `src/components/button.tsx`, and pass `Edit <display name>` and `Delete <display name>` from the team rows in `team-list.tsx` (the inline confirmation's Delete and Cancel buttons keep their labels). *Done when:* the new test passes and fails if the `slice(1)` tail is removed from `updateFranchise`, F-01 and F-02 are marked `fixed`, and lint, typecheck and `npm test` pass.

## Files / areas

- New `src/leagues/ids.ts`; changed `src/leagues/league.ts` (alias the id generator only)
- New `src/teams/franchise.ts`, `franchise-repository.ts`, `use-franchises.ts` and tests for the first two
- New `src/components/teams/team-list.tsx`, `team-form.tsx`, `color-picker.tsx`
- Changed `src/leagues/league-repository.ts` (cascade delete, size guard) and its test, `src/components/leagues/league-detail.tsx`, `league-form.tsx`, and `src/app/index.tsx` (team modes inside the detail pane)
- Reused unchanged: `Grade` and `GRADES` from `src/rules/charts.ts`, `Button`, `ChoiceButton`, themed components, `MasterDetail`, storage layer
- Changed `src/app/_layout.tsx` (gesture root) and `package.json` (adds `reanimated-color-picker`, authorized by step 7); no new route or schema version change

## Data / contracts

- Persisted in the existing database, collection `franchises`, one document per franchise, document id = `Franchise.id`. A new collection needs no migration; schema version stays 1.
- `Franchise`: `{ id: string; leagueId: string; initialGrade: 'A'|'B'|'C'|'D'|'F'; identities: FranchiseIdentity[] }`. `id` comes from `createId()` once at create and never changes. `identities` is non-empty, and this feature writes exactly one entry.
- `FranchiseIdentity`: `{ fromSeason: number; city: string; name: string; primaryColor: string; secondaryColor: string }`. `fromSeason` is 1 for the first identity. A season's identity is the entry with the greatest `fromSeason` not above that season (the rule feature 11 and later rely on). City and name are stored trimmed, 1 to 60 characters; colors are lowercase `#rrggbb`. In name-only leagues `name` is the full display name and `city` is still stored.
- `leagueId` is the franchise's current league pointer, not ownership of its history. The overview says a franchise is never owned by a league; here it records which league the team is set up in before any season exists. Feature 10 adds season-scoped membership, and the pointer then becomes the team's current league. Until then, deleting a league deletes its franchises, because no seasons or players exist to preserve.
- Uniqueness: team names are unique within one league by trimmed, case-insensitive comparison of the first identity's `name`. The repository reads the league's teams before writing; one local user makes a read-then-write check sufficient. Cross-league uniqueness is feature 5.
- Capacity: a league cannot exceed `size` teams, and `updateLeague` refuses a `size` below the team count with `fields.size` set. Fewer teams than `size` is a normal in-progress state.
- Repository results use the existing `LeagueResult` style: success carries the value, failure carries `{ kind: 'validation', fields }`, `{ kind: 'not-found' }` or `{ kind: 'storage', error }`. Validation, duplicate-name and full-league failures never write. Create and update write one document in one `batch`; deleting a league uses one `batch` for the league and all its franchises.
- A stored franchise that is not valid is never listed, never modified, and is counted as unreadable; the repository does not delete it. A valid-looking franchise whose league no longer exists is not listed anywhere and is left alone.
- Rendering: city and name are plain text through `Text`, never markup. Colors come from validated hex only.

## Testing

- `npm test` is a gate. In-scope logic needing tests: validation, hex normalization, display name, duplicate-name detection, `isFranchise`, the franchise repository, and the league repository changes (cascade delete and size guard).
- UI (steps 3 to 6) is verified by hand on web and iOS; there is no browser test harness, so nothing here claims visual, persisted-restart or interaction evidence until the user runs it.
- Baseline observed at spec time: typecheck, lint and `npm test` (13 suites, 154 tests) pass on `main`. No combined Verify command exists.

## Notes for the AI

- Expo SDK 57: check versioned docs before using Expo or React Native APIs. Use plain React Native components and the existing themed components; no form library; the only color-picker package is `reanimated-color-picker` (step 7).
- Accessibility: every input has a visible label and `accessibilityLabel`; error text sits next to its field with the alert role; swatches expose a role, selected state and a text label (the hex value) so color is not the only cue.
- Keep rules and repository code free of React. Follow `blueprint/context/coding-standards.md`: strict TypeScript, no `any`, kebab-case files, `@/` imports, minimal comments, no em dashes. Mirror the shape of `league.ts`, `league-repository.ts`, `use-leagues.ts` and `league-form.tsx`.
- Do not start a dev server; ask the user to run web and iOS and report back.

## Open questions

Chosen here, open to change (reversible; colors are stored as hex either way):

- Color picker is a 12-swatch palette plus a hex field, with an optional wheel from `reanimated-color-picker` added in step 7 at your request.
- `leagueId` lives on the franchise as the current-league pointer (see Data / contracts), a deliberate softening of "never owned by a league" until seasons exist in feature 10. Say so if you would rather have a separate membership collection now.
- The league size cannot be reduced below the current team count. Naming style and relegation settings stay editable with teams present.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":16287,"specSha256":"bbe5e30c309e4bc7e82892836f44218d3a979bc39286d5168e25f1b478b3f183","branch":"refs/heads/feature/teams-and-franchises","head":"ecfae622a5ed319b4e756f342b9af4910571b715","baseRef":"refs/heads/main","baseCommit":"ecfae622a5ed319b4e756f342b9af4910571b715","sourceTree":"f1577a949596dbc3472311ddd60f9895aa0e6ec0","landing":"local-merge","absentOptional":[]} -->

## Findings

### 4/F-01 [P3] closed - Test named "keeps later identities" never has a later identity

**File:** src/teams/franchise-repository.test.ts:79
**Found:** 2026-10-13 by /audit (scope: current; lens: quality, security, performance, tests)
**Why it matters:** `updateFranchise` rewrites `identities` as `[new, ...existing.identities.slice(1)]` so offseason identity history (feature 11) survives an edit. The test only creates a one-identity franchise, so dropping the `slice(1)` tail would still pass.
**Suggested fix:** Seed a franchise with a second identity (`fromSeason: 2`) through `db.batch`, update it, and assert the second identity is unchanged.
**Resolution:** Test now seeds a second identity and asserts it survives an update; removing the `slice(1)` tail makes it fail (checked). Re-reviewed franchise-repository.test.ts:74-85 and `updateFranchise`: the tail is asserted and no new defect found.

### 4/F-02 [P3] closed - Per-team Edit and Delete buttons have identical accessible names

**File:** src/components/teams/team-list.tsx:130
**Found:** 2026-10-13 by /audit (scope: current; lens: quality, security, performance, tests)
**Why it matters:** Every team row renders buttons labelled just "Edit" and "Delete". A screen reader user hears the same name for each row and cannot tell which team the button affects. `Button` has no way to pass an `accessibilityLabel`.
**Suggested fix:** Add an optional `accessibilityLabel` prop to `Button` and pass `Edit <team name>` and `Delete <team name>` from the team rows.
**Resolution:** `Button` takes an optional `accessibilityLabel`; team rows pass `Edit <name>` and `Delete <name>`. Re-reviewed button.tsx and team-list.tsx: labels start with the visible text, the confirmation buttons are unchanged, no new defect found.
