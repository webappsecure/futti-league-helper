# Fix: Offseason wizard stuck states and stale picks

**Type:** Fix
**Status:** verified
**Branch:** `fix/offseason-wizard-stuck-states-and-stale-picks`
**Fixes:** F-03, F-04, F-05

## The problem

The full audit (`blueprint/context/findings.md`) raised three findings in the offseason wizard and plan code. F-02 (old plans feeding name checks, unverified P3) is not reachable until feature 13 and stays for 13's spec.

- **F-03 (P1)** `src/components/offseason/arrivals-step.tsx`: when arrivals were staged and the linked league is then unlinked or deleted, `arrivalsReady` is false (nothing expected, arrivals still staged) but the step shows only "No teams are moving in from linked leagues." with no way to clear them. Next stays disabled, so protection, aging and free agency can never be opened.
- **F-04 (P2)** `src/seasons/season-archive-repository.ts` `updateFinishingOrder`: the free agency pick order depends on archived finishing positions, in this league's plan and in the plans of leagues whose arrivals came from this season. Editing the order leaves their saved `freeAgentPicks` in place, so picks silently disagree with the order they were made under.
- **F-05 (P3)** `src/offseason/wizard.ts` `stepStatuses`: protection, aging and free agency need at least one participating team. A league whose teams all leave and that receives no arrivals (departures may equal the league size) can never complete them, and Next stays disabled on "No teams take part".

## The fix

- **F-05:** the three team-based steps are complete when a plan is saved and no team takes part (`every` over an empty list); with no plan they stay incomplete. No other step logic changes.
- **F-03:** in `ArrivalsStep`, when the arrival status shows nothing expected but a non-empty staged list, show a short explanation and a "Clear staged arrivals" button that calls the existing `stageArrivals` (it writes an empty list when nothing is expected, and already drops protections and picks). It disables while running, shows errors with `planErrorText`, and refreshes the wizard data (the step gets the wizard's `refresh`). No change to `stageArrivals` itself.
- **F-04:** `updateNow` in `season-archive-repository.ts` additionally reads the offseason plans (failing closed with `unreadable`-style storage error on an unreadable plan, like the other reads) and, in the same batch as the archive write, rewrites without `freeAgentPicks` every plan that has picks and either belongs to this season or has an arrival whose `sourceSeasonId` is this season. Protections and aging results are not affected by finishing order and stay. `finishNow` is unchanged (no plans exist before the season ends).
- Must not break: the existing order edit, arrivals staging, wizard gating and the 625 passing tests; no new abstraction, dependency or stored field.

## Build steps

- [x] **Step 1 - F-05: complete the team steps when no team takes part** - Change `stepStatuses` in `src/offseason/wizard.ts` so protection, aging and free agency compute from `plan !== null && teams.every(...)`. Update `src/offseason/wizard.test.ts` (the "incomplete when no teams take part" case becomes complete with a saved plan and stays incomplete without one). *Done when:* wizard tests cover both cases and `npm test` passes.
- [x] **Step 2 - F-03: let the arrivals step clear stale arrivals** - Add the explanation and "Clear staged arrivals" button to `src/components/offseason/arrivals-step.tsx`, pass `refresh` from `wizard-screen.tsx`, and add a repository test in `src/offseason/offseason-arrivals-repository.test.ts`: stage arrivals for a linked pair, unlink with `unlinkLeagues`, confirm `getArrivalStatus` shows nothing expected and not current, call `stageArrivals`, then confirm the staged list is empty and `arrivalsReady` is true; also confirm protections and picks are dropped by that restage. *Done when:* the new test passes, lint, typecheck and `npm test` pass, and the button is reachable by reading the step against that status.
- [x] **Step 3 - F-04: clear picks when the finishing order changes** - Extend `updateNow` as described and add tests in `src/seasons/season-archive-repository.test.ts` or the free agency repository tests: a plan with picks loses them when its own season's order is edited; a linked league's plan with arrivals from that season loses its picks; an unrelated league's plan keeps them; protections and aging results stay; an unreadable plan fails the edit without changing the archive. *Done when:* those tests pass, lint, typecheck and `npm test` pass.

## Verify

- `npm test`, `npx tsc --noEmit` and `npm run lint` pass.
- By hand (web or tablet): stage arrivals for a linked pair, unlink the leagues, open the arrivals step: clear the staged arrivals and Next unlocks. Run the draft, then edit the finishing order: the picks are gone and the draft restarts. For F-05, a league with no teams staying and no arrivals reaches the end of the wizard.

## Notes

- Read the Expo SDK 57 docs before using any Expo or React Native API not already used in the offseason step screens.
- Commits carry no AI attribution (AGENTS.md rule). Blueprint files are tracked in git, so the fix archive and the findings ledger go in the same commit.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":5235,"specSha256":"64116859c6f706ec73b65017e8f41beb65ca31a2d796cd3fe1f54e96ee44e843","branch":"refs/heads/fix/offseason-wizard-stuck-states-and-stale-picks","head":"cfa55a29b7600c440f6caa8dc2885ac381495422","baseRef":"refs/heads/main","baseCommit":"cfa55a29b7600c440f6caa8dc2885ac381495422","sourceTree":"96cd2374db28f390d6f3c7be7bf699933d5a36ce","landing":"local-merge","absentOptional":[]} -->

## Findings

### offseason-wizard-stuck-states-and-stale-picks/F-03 [P1] closed - Stale staged arrivals leave the wizard stuck when the linked league is gone

**File:** src/components/offseason/arrivals-step.tsx:16
**Found:** 2026-10-21 by /audit (scope: full; lens: all)
**Why it matters:** `arrivalsReady` (src/offseason/roster-changes.ts:86) is false when no teams are expected but arrivals are still staged. That happens after arrivals are staged and the league link is then removed (`unlinkLeagues` has no offseason guard) or the linked league is deleted. `ArrivalsStep` then shows only "No teams are moving in from linked leagues." with no Restage button, so the arrivals step never completes, Next stays disabled, and protection, aging and free agency cannot be opened. Re-linking the same pair is the only way out, and impossible after a delete.
**Suggested fix:** In `ArrivalsStep`, when nothing is expected but `staged` is non-empty, show a "Clear staged arrivals" button that calls `stageArrivals` (which writes an empty list when nothing is expected). Add a repository test for staging after the link is removed.
**Resolution:** Closed 2026-10-21 by /audit (scope: current): re-read arrivals-step.tsx and the restage path. With nothing expected and arrivals staged the step shows a Clear button that runs stageArrivals, which writes an empty list; the new repository test covers unlink then clear; no new defect found.

### offseason-wizard-stuck-states-and-stale-picks/F-04 [P2] closed - Editing the finishing order does not clear free agency picks

**File:** src/seasons/season-archive-repository.ts:84
**Found:** 2026-10-21 by /audit (scope: full; lens: all)
**Why it matters:** The free agency pick order is derived from archived finishing positions, in this league and in a linked league's plan. `updateFinishingOrder` rewrites the archive but leaves `teamChanges` and `freeAgentPicks` in place, and the wizard's order step stays openable from later steps. Picks already made were made under the old order, and a linked league's saved picks silently use an order they were not made under. The program rules say the best finisher picks first.
**Suggested fix:** After a successful `updateFinishingOrder`, drop `freeAgentPicks` from this league's plan and from any linked league's plan whose arrivals came from this season (same rule as the other clears), or make the order step read-only once picks exist. Add a test.
**Resolution:** Closed 2026-10-21 by /audit (scope: current): re-read updateNow in season-archive-repository.ts. Picks are dropped in the same batch as the archive write for the league's own plan and plans with arrivals from that season; unreadable plans fail closed; tests cover own, linked, unrelated and unreadable cases; no new defect found.

### offseason-wizard-stuck-states-and-stale-picks/F-05 [P3] closed - A league with no participating teams can never finish protection

**File:** src/offseason/wizard.ts:38
**Found:** 2026-10-21 by /audit (scope: full; lens: all)
**Why it matters:** `validateDepartures` allows promoted plus demoted to equal the league size, and with no linked leagues no arrivals come in, so no team stays. `protectedAll` requires at least one team, so the protection step never completes and Next stays disabled, while the step says "No teams take part". Rare configuration, no data loss.
**Suggested fix:** Treat protection, aging and free agency as complete when no team takes part, or reject departures that leave no staying team and no arrival.
**Resolution:** Closed 2026-10-21 by /audit (scope: current): re-read stepStatuses in wizard.ts. With a saved plan and no participating team the three team steps complete; without a plan they stay incomplete; arrivals gating still precedes them, so pending arrivals cannot be skipped; tests cover both cases.
