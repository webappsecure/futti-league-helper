# Feature: Offseason: former teams

**From build-plan:** feature 11d
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/offseason-former-teams`

## Goal

Let the commissioner fill a vacancy with a former member of this league: a team that left it in an earlier offseason with no linked league to join and has been sitting unassigned since (feature 13c). The team comes back with its saved roster, rated up or down by the kind of vacancy, and then takes part in protection, aging, free agency, the rookie draft and progression like any other team brought in. Everything is staged in the offseason plan; live data changes only at approval.

## Decisions (defaults to confirm in review)

The rules come from the program specs ("Existing teams brought in" in the offseason order) and the 11b/11c work; the rest are my defaults.

- **D1. Who is eligible:** a franchise with no `leagueId` that left this league (its id is in `promoted` or `demoted` of a saved plan whose `leagueId` is this league), whose roster is saved, and that is not already staged. No new stored field: the saved plans of finished seasons (kept since 13c) are the record. A team that left a different league is not eligible here.
- **D2. Which vacancy:** the same places new teams can fill: a side with no linked league, `promoted` or `demoted`. A former team and a new team compete for the same places; the commissioner chooses the side for a former team.
- **D3. Rating adjustment (program specs, confirmed after a manual check):** it follows the team being replaced, not the direction the team moves. Replacing a promoted team (the team moves down, into a junior league): offense and defense each rise 1 (max 5 each, total max 8, lower side only if both would exceed), goaltenders rise 2 (max 46). Replacing a demoted team (the team moves up, into a senior league): offense and defense each drop 1 (min 1), goaltenders drop 2 (min 31). Control stars are rerolled, then corrected (feature 18). This is `adjustRoster` with the vacancy as the movement.
- **D4. It takes part like an arrival:** aging, free agency, rookie draft, progression and approval treat it as a team that took part, not as a new team.
- **D5. Draft order (corrected after a manual check):** it goes with the arrivals that move the same way, after them: a team replacing a promoted team moves down, so it picks early in free agency and late in the rookie draft; a team replacing a demoted team moves up, so it picks last in free agency and first in the rookie draft. The rookie order is the reverse of the free agency order.
- **D6. Staging and removing change who takes part,** so protections, aging results, free agency picks, the draft and progression are dropped, exactly as restaging arrivals does today. A new team does not take part, so adding or removing one still clears nothing.
- **D7. Team name check:** the former team's current name must not clash with a team in the league's chain or a staged new team (a new team may have taken it since). A clash is a field error and the team cannot be staged.
- **D8. Where it lives in the wizard:** inside the existing New teams step, as a "Former teams" section above the create-a-team form. The step title becomes "New and former teams". No new step.

## In scope

- `StagedFormerTeam` in the plan: franchise id, vacancy side, identity snapshot (for names), adjusted players. Validated in `isOffseasonPlan`; an old plan without it stays valid.
- `participatingTeams` returns former teams (origin `former`) after arrivals; `draftOrder`, `openVacancies` and `newTeamsFit` count them (D5, D2).
- Repository: `listFormerTeams(db, league)`, `addFormerTeam`, `removeFormerTeam`, through `acceptQueue`, fail-closed reads.
- Approval (13c): load the franchise documents of staged former teams, move them into the league, write their roster, count them in the summary.
- UI: Former teams section (list eligible teams with name, how and when they left, side buttons), staged list with remove, errors; name display for former teams in the wizard; approval summary line.
- Tests for all of it.

## Out of scope

- Former teams of other leagues, or of a chain neighbor.
- Editing a former team's identity or roster before it returns.
- A browsable list of all unassigned teams outside the wizard (feature 14 territory).
- Reversing a staged return after approval.

## Build loop

`workflow.stepReview` is `feature`: build all steps, run the narrow check per step, then one final review packet. `workflow.checkpointCommits` is `disabled`; `/complete` makes the single commit.

## Build steps

- [x] 1. **Plan shape and participation.** Add `StagedFormerTeam` and `OffseasonPlan.formerTeams` with validation; widen `ParticipatingTeam.origin` to include `former`; `participatingTeams` appends former teams; `draftOrder` places them (D5); `openVacancies` and `newTeamsFit` count them against the same places as new teams.
  Done when: tests cover validation (good, bad vacancy, duplicate id, bad players), participation order, draft order for both sides, and vacancy counting with a mix of new and former teams; typecheck and `npm test` pass.
- [x] 2. **Eligibility and staging.** In `offseason-plan-repository.ts` (or a sibling file if it grows too large): `listFormerTeams` (D1: unassigned franchises, saved roster, in a plan of this league's `promoted`/`demoted`, not staged; newest departure first), `addFormerTeam(db, league, franchiseId, vacancy, options)` (checks season in offseason, plan saved, vacancy open on that side, eligibility, name check D7; builds players with `adjustRoster` and `limitTeamStars`; drops dependent plan fields D6), `removeFormerTeam`. New `PlanError` kinds `not-former` and `name-taken` with `planErrorText` strings.
  Done when: memory-database tests cover listing (eligible, other league's team, assigned team, already staged), adding on each side with the expected rating change, no open vacancy, ineligible team, name clash, dependents cleared (protections and later), removal, a failed write changing nothing, and unexpected storage errors propagating as `storage`; `npm test` passes.
- [x] 3. **Approval.** Load staged former teams' franchise documents (no `leagueId`) alongside the chain's; the franchise becomes `leagueId: <league>` and its roster document is replaced with the final roster; the summary counts former teams; the `wrong-team-count` check includes them.
  Done when: a repository test takes a league through an offseason where one team leaves unassigned, then through the next offseason where it returns as a former team (both sides), and checks the franchise, roster, ages, season index and that it no longer appears unassigned; the 13c approval tests still pass.
- [x] 4. **Wizard UI.** `former-teams-section.tsx` rendered in the New teams step: eligible teams (display name, "left in season N"), a button per open side, staged list with remove, per-action busy state, `accessibilityRole="alert"` errors, names as plain text. `wizard-screen.tsx` `nameOf` resolves former teams from their identity snapshot; the step title becomes "New and former teams"; `approval-step.tsx` mentions returning teams.
  Done when: lint, typecheck and `npm test` pass; every state (no plan, no eligible team, no open vacancy, eligible, staged, error, busy) is reachable by reading the screen against the repository results; the user checks it in the app (see Testing).
- [x] 5. **Final gate.** `npx tsc --noEmit`, `npm run lint`, `npm test`; remove dead code.
  Done when: all pass and every step is checked.

## Files / areas

- Changed: `src/offseason/offseason-plan.ts`, `roster-changes.ts`, `free-agency.ts` (`draftOrder`), `new-teams.ts`, `offseason-plan-repository.ts`, `approval.ts`, `approval-repository.ts` (+ their tests), `src/components/offseason/new-teams-section.tsx`, `wizard-screen.tsx`, `approval-step.tsx`, `src/offseason/wizard.ts` (title only).
- New: `src/components/offseason/former-teams-section.tsx`; former-team repository code beside `offseason-plan-repository.ts`.
- Reuse: `adjustRoster`, `limitTeamStars`, `identityForSeason`, `acceptQueue`, `listFranchises`-style fail-closed reads, `FRANCHISE_COLLECTION`, `ROSTER_COLLECTION`, `OFFSEASON_PLAN_COLLECTION`.

## Data / contracts

- No new collection and no migration. `offseason-plans` documents gain an optional `formerTeams` array: `{ franchiseId, vacancy: 'promoted' | 'demoted', identity: FranchiseIdentity, players: RosterPlayer[] }` (8 players, ages 18+).
- An unassigned team stays exactly as 13c left it (franchise without `leagueId`, roster without `leagueId`) until approval; approval is the only write to it.
- All writes go through `acceptQueue` and a single `db.batch`; reads fail closed (an unreadable plan, franchise or roster document is an error, never "none").
- Team and player names are user data and are rendered only as text.

## Testing

- Unit and memory-database tests as listed. No UI test runner exists, so step 4 is checked by reading the screen against the results and by hand: finish a league with relegation and no link twice so a team leaves unassigned, then in the next offseason bring it back and walk the wizard to approval.
- `npx tsc --noEmit`, `npm run lint` and `npm test` must pass. No combined Verify command is declared. The last full run (743 tests, tsc and lint clean) was on the current `main`; nothing was re-run for this spec.

## Notes for the AI

- Follow the 11b/11c patterns (staged in the plan, `acceptQueue`, `PlanError` results) and 13c's "later writes drop dependent fields".
- Keep rule logic pure with injected rng; no `Math.random()` outside default parameters.
- Do not add AI attribution to commits.

## Open questions

None blocking. Please confirm D1 (eligibility from saved plans, this league only), D5 (draft position) and D8 (inside the New teams step).


<!-- blueprint:completion {"schemaVersion":2,"specBytes":9824,"specSha256":"ba6d44e744a4f7aa450240e56d76717c024a9a4843769f4d97a83c6c8b796708","branch":"refs/heads/feature/offseason-former-teams","head":"ec534ff9ebee02cc5fa38f2594939dde46516959","baseRef":"refs/heads/main","baseCommit":"ec534ff9ebee02cc5fa38f2594939dde46516959","sourceTree":"021db9a124ca39f2a2debf1937068cdf75f2bab6","landing":"local-merge","absentOptional":[]} -->
