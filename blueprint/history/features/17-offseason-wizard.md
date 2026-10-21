# Feature: Offseason wizard

**From build-plan:** feature 17
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/offseason-wizard`

## Goal

Replace the busy Offseason card with a step-by-step wizard. Each step is its own screen with one job, a "Step n of N" heading, and Back and Next. League detail only shows a short status and a Continue offseason button. Progress comes from the saved offseason plan, so the commissioner can leave and resume. The wizard reuses the existing departures, arrivals, new-teams and 12a protection/aging logic; no rule or stored data changes.

## Decisions (from the user and the plans)

- **One route per step:** `/offseason/<leagueId>/<step>`, one file `src/app/offseason/[leagueId]/[step].tsx` that renders the step named in the URL. Unknown steps and unknown leagues show a clear message with a way back.
- **Steps, in order:** `order` (finishing order), `departures`, `arrivals`, `new-teams`, `protection`, `aging` (aging, retirement and release). Later features add steps (free agency draft in 12b, rookie draft, progression and approval in 13); the step list is one array so that is a one-line addition per step plus its screen.
- **One thing at a time inside steps:** protection shows one team on the clock at a time (its 8 players, tap one to protect, Previous team / Next team, "Team 3 of 8"); aging shows one compact line per team after the run, not full rosters.
- **Finishing order:** ending the season (entering the order while it is active) stays on the season card. Once the season is in the offseason, viewing and editing the final order moves to the `order` step, and the season card shows only "Season n has ended".
- **Gating:** Next is enabled only when the current step is complete, except `new-teams` and `order`, which never block. Complete means: `departures` has a saved plan; `arrivals` has nothing expected or the staged arrivals are current (`arrivalsReady`); `protection` has a protection for every participating team; `aging` has retire and release results for every team. Opening a step past the first incomplete one redirects to the first incomplete step.
- **Leaving:** every step has "Back to league" (returns to the Leagues tab with the league still selected). Back on the first step does the same; Next on the last step returns to the league. Navigation is not disabled during a write: writes finish through the serialized queue either way.
- **Who gets it:** same as today's card: relegation leagues whose season is in the offseason. Leagues without relegation have no offseason screens (see Open questions).

## In scope

- Pure wizard model: ordered steps, per-step completion, first incomplete step, previous/next, gating.
- A `useOffseasonWizard(leagueId)` hook that loads the league, its season, archive, plan and arrival status together with one refresh.
- The wizard screen and shell (title, "Step n of N", Back, Next, Back to league) with loading, error and Retry, league not found, season not in offseason, no results saved, and unknown step states.
- The six step screens, reusing the existing departures editor, arrivals section and new-teams section, the sortable finishing-order list, and the 12a repository operations.
- League detail: a compact offseason status card with Continue offseason; the season card's offseason view reduced to a one-line "ended" message; the old Offseason card removed.

## Out of scope

- Any change to offseason rules, the plan data, the repository operations or storage (12a, 11a to 11c logic stays as is).
- Free agency draft (12b), rookie draft, progression, approval (13), former teams (11d).
- Redesigning the rest of league detail (teams list, colors, linked leagues, game cards); only the offseason and season-end parts change.
- Offseason screens for leagues without promotion and relegation.
- Browser or automated UI tests (none are configured).

## Build loop

Build one small step at a time. `workflow.stepReview` is `feature`: one review packet after all steps. `workflow.checkpointCommits` is disabled. `/complete` makes the final feature commit.

## Build steps

- [x] **Step 1 - Wizard model** - Add `src/offseason/wizard.ts` with `WIZARD_STEPS` (`'order' | 'departures' | 'arrivals' | 'new-teams' | 'protection' | 'aging'` with a title and one-sentence instruction each), `isWizardStep(value)`, `stepStatuses(input)` returning `complete` or `incomplete` per step from `{ plan: OffseasonPlan | null, teams: ParticipatingTeam[], arrivals: Pick<ArrivalStatus, 'expected' | 'staged' | 'current' | 'blocked'> }` using the completion rules above (`order` is always complete because the wizard only opens once the archive exists, so it takes no input), `firstIncompleteStep(statuses)`, `canOpenStep(step, statuses)`, `previousStep`, `nextStep` (null at the ends), and `nextBlocked(step, statuses)` (true when the step is `incomplete` and blocks). *Done when:* unit tests cover step order and ids, `isWizardStep`, every completion rule (no plan, plan without arrivals, arrivals expected and stale or current or blocked, partial protection, full protection, protection without results, full aging results), `firstIncompleteStep` for each state, `canOpenStep` for earlier, current and later steps, previous/next at both ends, and that `new-teams` and `order` never block; `npm test` passes.
- [x] **Step 2 - Route, hook and shell with the first two steps** - First read the Expo SDK 57 Expo Router and native tabs docs (`https://docs.expo.dev/versions/v57.0.0/`, `https://docs.expo.dev/llms.txt`) and choose how to add a route that is not a tab (for example a root Stack holding the tabs and the `offseason` routes, or hiding the route from `NativeTabs`) so that going back returns to the Leagues tab with its selected league intact; record the choice in this spec. *Chosen (from the Expo docs on nesting navigators and native tabs):* the root layout is a headerless `Stack`; the two tab routes moved into a `(tabs)` route group whose layout renders `AppTabs` (URLs unchanged), and `offseason/[leagueId]/[step]` is pushed above the tabs, so going back returns to the Leagues tab with its state. The wizard is not a tab and shows no tab bar. Add `src/offseason/use-offseason-data.ts` (`useWizardLeague` loads the league by id; `useOffseasonData(league, season)` composes through `getLeague`, then `useLeagueSeason`, `useSeasonArchive`, `useOffseasonPlan`, `useArrivalStatus`, one `refresh`, one `retry`, a single state of `loading | error | ready` with the not-found and not-in-offseason cases explicit), `src/app/offseason/[leagueId]/[step].tsx`, and `src/components/offseason/wizard-shell.tsx` (title, "Step n of N", instruction, body, Back, Next, Back to league, redirect to `firstIncompleteStep`). Add the `order` step (`src/components/offseason/order-step.tsx`: read-only numbered order with "Edit finishing order" using the existing `SortableList`, `reorderTeams` and `updateFinishingOrder`, drag with the existing keyboard and screen-reader path) and the `departures` step (`src/components/offseason/departures-step.tsx`: the `PlanEditor` and `Toggle` from `offseason-card.tsx` moved as is, with its saved message). The old Offseason card keeps working and still uses the shared departures editor. *Done when:* lint, typecheck and `npm test` pass; opening `/offseason/<leagueId>/order` and `/departures` is reachable by reading the route and shell against the hook states (device check in step 6).
- [x] **Step 3 - Arrivals and new teams steps** - Add `src/components/offseason/arrivals-step.tsx` and `new-teams-step.tsx` that render the existing `ArrivalsSection` and `NewTeamsSection` with the hook's plan, arrival status and refresh, adding only the step's short lead sentence and the open-places or no-linked-leagues empty text where the section already returns nothing (an unlinked league shows "No teams are moving in from linked leagues"). Next stays disabled on `arrivals` until `arrivalsReady`; `new-teams` shows the existing over-capacity warning and never blocks. *Done when:* lint, typecheck and `npm test` pass; each state (blocked neighbor, none expected, expected unstaged, stale, staged, over capacity) is reachable by reading the screens against the repository results.
- [x] **Step 4 - Protection and aging steps** - Add `src/components/offseason/protection-step.tsx`: uses `participatingTeams(archive, plan)`, one team on the clock with a local team index, its name and 8 players through `playerLine`, a tap on a player calls `setProtection` and shows "Protected", "Previous team" and "Next team" move the index, a "Protected n of m teams" line, the stale-changes warning from `changesAreCurrent`, the not-ready text when `arrivalsReady` is false, and no controls when no teams take part. Add `src/components/offseason/aging-step.tsx`: the "Age, retire and release" button (enabled only when every team is protected and arrivals are ready; "Re-run" with "Re-running rerolls the release" after a run) calling `ageAndRelease`, and after a run one line per team: team name, the retiring player and the released player with ages shown as `age + AGING_YEARS`. Names render as plain text; players have accessibility labels "Protect <name>, <team>" and a selected state. Errors use `planErrorText` in the existing error style and buttons disable while a write runs. *Done when:* lint, typecheck and `npm test` pass; every state above is reachable by reading the screens against the 12a repository results.
- [x] **Step 5 - League detail entry point** - Add `src/components/offseason/offseason-status-card.tsx` and render it in `league-detail.tsx` in place of `OffseasonCard` for a relegation league in the offseason: "Offseason" heading, one status line (for example "Next: Protection" from `firstIncompleteStep`, or "All steps done"), and a "Continue offseason" button that navigates to `/offseason/<leagueId>/<step>` with `router.push`; it shows its own loading and error-with-Retry states. In `season-card.tsx` replace the offseason-state order list and "Edit finishing order" with the single line "Season n has ended. Its rosters and team names are saved." and remove the now unused editing state there. Delete `offseason-card.tsx` once nothing imports it. *Done when:* lint, typecheck and `npm test` pass and a search finds no import of the old card.
- [x] **Step 6 - Device check** - The user runs the app on web and a tablet: with a relegation league (and a linked pair), end the season; confirm league detail shows only the compact offseason card; Continue offseason opens the first incomplete step; walk order (edit and save), departures (save), arrivals (stage), new teams (add one, reroll, remove), protection (one team at a time, all teams), aging (run, re-run); confirm Next is disabled on an incomplete step, opening a later step by URL redirects, Back and Back to league work and return to the same selected league, leaving and resuming lands on the first incomplete step, reload persists everything, and live rosters, ages and burned names are unchanged. Also confirm the 12a checks: exactly one retiree (oldest unprotected, goaltender first on an age tie, never the protected player) and one released player per team, ages shown one year older, and a changed protection clears results. *Done when:* the user confirms, or any difference is fixed or recorded here. *Result:* the user ran the app and reported "looks a lot better with the wizard" and "enabling steps looks good so far"; the full walkthrough (including the 12a retire and release checks) was not itemized, so those checks rest on the unit and repository tests.

## Files / areas

- New: `src/offseason/wizard.ts` (+ test), `src/offseason/use-offseason-data.ts`, `src/components/offseason/wizard-screen.tsx`, `src/app/offseason/[leagueId]/[step].tsx` (plus a layout file if the route choice in step 2 needs one), `src/components/offseason/wizard-shell.tsx`, `order-step.tsx`, `departures-step.tsx`, `arrivals-step.tsx`, `new-teams-step.tsx`, `protection-step.tsx`, `aging-step.tsx`, `offseason-status-card.tsx`.
- Changed: `src/app/_layout.tsx` (root Stack) and moved `src/app/index.tsx` and `settings.tsx` into `src/app/(tabs)/` with a `(tabs)/_layout.tsx`, `src/components/leagues/league-detail.tsx`, `src/components/seasons/season-card.tsx`.
- Deleted: `src/components/offseason/offseason-card.tsx` (its departures editor moves to `departures-step.tsx`).
- Reuse, unchanged: `arrivals-section.tsx`, `new-teams-section.tsx`, `sortable-list.tsx`, `src/offseason/roster-changes.ts` and its repository, `offseason-plan-repository.ts`, `getLeague`, `useLeagueSeason`, `useSeasonArchive`, `useOffseasonPlan`, `useArrivalStatus`, `updateFinishingOrder`, `reorderTeams`, `playerLine`, `Button`.

## Data / contracts

- No stored data changes and no new collection; progress is derived from the saved plan, archive and arrival status, so resuming needs nothing extra.
- Route contract: `/offseason/<leagueId>/<step>` with `<step>` one of `order`, `departures`, `arrivals`, `new-teams`, `protection`, `aging`. `leagueId` is a league id; step ids are stable so later features add steps without renaming these. Bad league or step shows a message, never a crash.
- Each write still goes through the existing repository functions (serialized by `acceptQueue`); the wizard adds no new writes. Reads fail closed and show the error with Retry.
- League, team and player names are stored or list text and render as plain `ThemedText`; all buttons have labels, errors use `accessibilityRole="alert"`, and the protect controls keep their accessibility labels and selected state.

## Testing

- Pure wizard model: unit tests as in step 1.
- UI and routing: lint and typecheck plus the manual device check in step 6. No browser test command is configured and none is claimed.
- Baseline before this feature (main at the 12a commit plus tracked Blueprint files): `npm test` 590 tests pass, `npx tsc --noEmit` and `npm run lint` clean. No combined Verify command exists; run all three before declaring done.

## Notes for the AI

- Read the Expo SDK 57 docs before choosing the route and tab approach and before using any Expo Router or navigation API not already used in this repo (the app currently uses only the two tab routes; `router`, `Link` and `useLocalSearchParams` come from `expo-router`).
- Move code, do not rewrite it: the departures editor, arrivals and new-teams sections keep their behavior and tests of the logic underneath.
- Keep each screen to one job; do not add the teams list, colors or the finishing order to any step other than `order`.
- Do not start dev servers; ask the user to run web and tablet checks.
- Commits carry no AI attribution (AGENTS.md rule). Blueprint files are now tracked in git, so the spec, archive and findings ledger go in the work commit.

## Open questions

Reversible choices, built as stated; tell me if any is wrong:

1. Finishing order and departures are two steps (the plan line listed them together) so each screen has one job.
2. `new-teams` never blocks Next because feature 13's approval will require every place to be filled, not this wizard.
3. Protection is one team at a time; if you prefer a plain list of teams with a "Protected" status you open one by one, say so.
4. Prerequisite gap carried over from 11a and 12a, not fixed here: leagues without promotion and relegation have no offseason card, plan or wizard. They need protection, aging and release too, so a `/fix` or feature 13 should cover them before approval works for them.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":15509,"specSha256":"97fc69708ea46e2ba47713fd290813efb780a56c5dab0ca6b2c99a14d4c7ad2e","branch":"refs/heads/feature/offseason-wizard","head":"4a0e8b928b6c427ff4340673e3e28a2390e5acd0","baseRef":"refs/heads/main","baseCommit":"4a0e8b928b6c427ff4340673e3e28a2390e5acd0","sourceTree":"b5c0de6e4ef4a199d91fd6c86cf10a2319314b73","landing":"local-merge","absentOptional":[]} -->
