# Feature: Offseason: progression

**From build-plan:** feature 13b
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/offseason-progression`

## Goal

Add progression as a new wizard step after the rookie draft. One button rolls progression for every eligible player (a d6 each, by age bracket and kind), applies the rating changes from the program specs, retires players whose rating falls out, and gives each retiring player's team a new random draftee of the same kind. Everything is saved in the league's staged offseason plan. Live teams, rosters and the name registry stay untouched until feature 13c approves the offseason.

This is the second of three pieces split from feature 13 (13a draft pool and rookie draft, done; 13b progression and replacing progression retirees; 13c approval and next season).

## Decisions (from the program specs, and two defaults to confirm)

- **Who progresses:** every player on a participating team (staying teams and arrivals) after retirement, release, the free agency picks and the move to the picking team. Not progressed: players already retired or released, rookie draft picks, replacement draftees, and players on newly created teams (they never take part).
- **Age used for the brackets (my default; confirm in review):** the age after this offseason's aging, that is the stored age plus `AGING_YEARS`, because progression comes after aging in the program specs.
- **Standard players (roll d6):**
  - age 23 or under: 1-2 raises total offense + defense by 1.
  - age 24 to 29: 1 raises by 1, 6 lowers by 1.
  - age 30 or over: 5-6 lowers by 1.
  - The total never goes above 8 (a raise at 8 changes nothing).
  - A total that falls to 1 retires the player.
- **When the total changes** (and the player does not retire): offense and defense are recalculated from the new total with the existing split chart (a d6, none for a total of 2); if the player originally had more offense than defense and the new split has more defense than offense, offense and defense are swapped, and the same in reverse; then control stars are rerolled from the new total (2d6). When the total does not change, nothing is recalculated.
- **Goaltenders (roll d6):**
  - age 23 or under: 1 raises goaltending by 2 steps, 2-3 by 1 step.
  - age 24 to 29: 1-2 raises by 1, 5-6 lowers by 1.
  - age 30 or over: 4-5 lowers by 1, 6 lowers by 2.
  - Steps follow the base-6 sequence (`addGoaltending`); the rating never goes above 46.
  - A rating that falls to 26 or below retires the goaltender (`isGoaltendingRetired`).
- **Replacements (my default; confirm in review):** a retiring player's team automatically gets a new random draftee of the same kind (position player for a position player, goaltender for a goaltender), built with the existing draft generators (age 18-22, draft charts, random last name). The commissioner makes no pick. Replacements do not progress.
- **Roll order:** teams in the participating-team order, players in roster order; for each player the d6 first, then, only if the total changed, the split d6 and the control-star 2d6. Replacements are generated after all rolls. All randomness comes from the injected rng.
- **Re-running** the step rerolls everything (like re-running aging). It needs no undo because nothing is applied until 13c.
- **Stale results:** changing a protection, re-running aging, making or undoing a free agency pick, saving departures, restaging arrivals, regenerating the draft pool, or making or undoing a rookie pick clears the progression results.
- **Names:** replacement names are not burned, not on a stored roster, and not on any staged new team, draftee or replacement in any saved plan. New teams and the draft pool also avoid replacement names. Names burn at approval (13c).

## In scope

- `progression` on `OffseasonPlan` with validation.
- Pure rules: eligible players, standard and goaltender progression, building the full result.
- One shared pure helper listing every staged player name in a plan (new teams, draft pool, replacements), used by the three name checks.
- Repository operation to run (or rerun) progression, errors and text, and clearing the results when their inputs change.
- A `progression` wizard step: not-ready, ready, results and no-teams states, dice shown next to each outcome.

## Out of scope

- Moving or deleting players, ageing, burning names, discarding undrafted draftees, creating the next season, approval (13c).
- Letting the commissioner choose replacements or edit a result.
- Progression for leagues without relegation (13c opens the wizard to them).
- Widening the stored-roster age limit (13c; see Data / contracts).

## Build loop

Build one small step at a time. `workflow.stepReview` is `feature`: one review packet after all steps. `workflow.checkpointCommits` is disabled. `/complete` makes the final feature commit.

## Build steps

- [x] **Step 1 - Plan model and shared names helper** - In `src/offseason/offseason-plan.ts` add `StagedProgression { franchiseId: string; playerId: string; roll: number; after?: RosterPlayer; replacement?: RosterPlayer }` and optional `progression?: StagedProgression[]` on `OffseasonPlan`. `franchiseId` is the team the player is on after the drafts; `roll` is the d6; `after` is the player with changed ratings (absent when unchanged or retired); `replacement` is set only when the player retires. Extend `isOffseasonPlan`: roll an integer 1-6; non-empty ids; each `playerId` at most once; `after` and `replacement` never both present; `replacement` a valid draftee, `after` a valid player of the same kind with age 18 or more and no upper bound (export the existing player check with age bounds from `src/rosters/roster.ts`; the stored-roster limit of 30 stays as it is). Add `stagedPlayerNames(plan)` (new team players, draft pool, replacements) and use it in `listStagedNewTeams` / `unavailablePlayerNames` in `offseason-plan-repository.ts` and in `unavailableNames` in `rookie-draft-repository.ts`, replacing the duplicated loops. *Done when:* unit tests cover `isOffseasonPlan` with valid progression and each invalid case (bad roll, duplicate player, both `after` and `replacement`, replacement not a draftee, `after` of the wrong kind or under 18), an old plan stays valid, `stagedPlayerNames` returns all three sources, and the new-team and draft-pool name tests from 13a still pass; `npm test` passes.
- [x] **Step 2 - Pure progression rules** - Add `src/offseason/progression.ts` with: `progressionPlayers(team, teams, plan)` (players that progress, as defined above, in roster order); `progressStandard(player, roll, rng)` and `progressGoalie(player, roll)` returning `{ after?, retired }` using the stored age plus `AGING_YEARS` for the brackets (the player passed in is unchanged); and `buildProgression(teams, plan, rng, makeStandard, makeGoalie)` returning `StagedProgression[]` in the roll order above, where the two makers build replacements. *Done when:* unit tests with scripted dice cover every bracket boundary for both kinds (ages 23/24 and 29/30 after the extra year), each roll value, the cap at 8 and at 46, a total falling to 1 and a goaltender falling to 26 or below (retire), a lowered total that flips offense and defense, no flip when originally equal, control stars rerolled only when the total changes, a goaltender going up from 36 to 41 and down from 41 to 36, the participating-team and roster order, that rookies, replacements and released or retired players are skipped, and that a free agency pick progresses on its new team; `npm test` passes.
- [x] **Step 3 - Repository: run, clear, errors** - In a new `src/offseason/progression-repository.ts` add `runProgression(db, league, options?: { rng?, newId?, pool? })` through `acceptQueue`, writing one `put` of this league's plan. Loading follows `generateDraftPool` (season in `offseason`, saved plan, archive, arrivals ready; fails closed with `storage`); it requires free agency complete, the draft pool generated and every team full, else the stable errors `free-agency-incomplete`, `pool-not-generated` and a new `rookie-draft-incomplete`; `no-names` when the name pool runs out (nothing written). It replaces any earlier results. In `roster-changes-repository.ts` `putClearingDraft` also drops `progression`, and add a sibling write for the rookie draft operations (`generateDraftPool`, `makeRookiePick`, `undoRookiePick`) that drops only `progression`; `saveOffseasonPlan` and `stageArrivals` already build a fresh plan and must be covered by tests. Extend `PlanError` and `planErrorText`. *Done when:* memory-database tests cover: a run for an unlinked league and a linked pair (counts match the eligible players, every retired player has a same-kind replacement, no replacement name is burned, on a roster or repeated); rerun replaces results; each error; `no-names` with a tiny pool; results cleared by a changed protection, re-run aging, a free agency pick and undo, saved departures, restaged arrivals, a regenerated pool, and a rookie pick and undo; names: new teams and the draft pool avoid replacement names; a failing write leaves the old plan; live roster, franchise, season and registry collections unchanged after every operation; `npm test` passes.
- [x] **Step 4 - Wizard step** - In `src/offseason/wizard.ts` add `'progression'` after `'rookie-draft'` to `WIZARD_STEPS` and `STEP_INFO` (title "Progression"), complete when the rookie draft is complete and results exist (a league with no participating team is complete once its plan is saved), and update its tests. Add `src/components/offseason/progression-step.tsx` and wire it in `wizard-screen.tsx`. Screen: not ready (arrivals not ready, free agency or rookie draft incomplete) with the reason; before running, how many players will progress and a "Run progression" button; after running, per team (draft order) one line per changed player ("<name> OF/DE 3/4 to 4/4, roll 2", "<name> GO 36 to 41, roll 1"), each retirement with its replacement ("<name> retires; <replacement> (age 19) joins"), a count of unchanged players, and "Run progression again" (rerolls everything). States: no teams, error text from `planErrorText`, buttons disabled while a write runs, names as plain text, accessibility labels on lines. *Done when:* lint, typecheck and `npm test` pass; every state above is reachable by reading the screen against the repository results.
- [x] **Step 5 - Device check** - The user runs the app on web and a tablet, with an unlinked relegation league and again with a linked pair: through the rookie draft, then progression. Confirm the button runs, results are plausible for the ages (including a retirement with a replacement when one occurs), running again rerolls, Next unlocks only after results exist, undoing a rookie pick or changing a free agency pick clears the results, and reload keeps everything; live rosters, ages and burned names are unchanged. *Done when:* the user confirms, or any difference is fixed or recorded here. *Result:* the user ran the app and reported "everything looks good"; individual checklist items were not itemized.

## Files / areas

- New: `src/offseason/progression.ts` (+ test), `src/offseason/progression-repository.ts` (+ test), `src/components/offseason/progression-step.tsx`.
- Changed: `src/offseason/offseason-plan.ts` (+ test), `src/rosters/roster.ts` (+ test: bounded player check), `src/offseason/roster-changes-repository.ts` (+ test: clearing), `src/offseason/rookie-draft-repository.ts` (+ test: clearing, shared names helper), `src/offseason/offseason-plan-repository.ts` (+ test: shared names helper, `PlanError`, `planErrorText`), `src/offseason/wizard.ts` (+ test), `src/components/offseason/wizard-screen.tsx`.
- Reuse, unchanged: `participatingTeams`, `AGING_YEARS`, `arrivalsReady`, `freeAgencyComplete`, `draftIsComplete`, `rosterCounts`, `generateDraftStandard`, `generateDraftGoalie`, `splitTotal`, `controlStars`, `addGoaltending`, `isGoaltendingRetired`, `namePicker`, `playerLine`, `acceptQueue`, `Button`, `TeamRosterPanel`, the wizard shell and hooks.

## Data / contracts

- No new collection. `offseason-plans` documents gain an optional `progression` array; an old document without it stays valid, so no migration or version bump.
- `StagedProgression`: one entry per progressing player, in roll order; `after` carries the player's new ratings with the stored (not yet aged) age; `replacement` is a full draftee record with an id from `createId`. The results are stored, not derived, because they are random.
- Consumer contract for 13c: approval applies the changes in this order: age every progressing player by `AGING_YEARS`, replace each progression retiree with its `replacement` (the retiree becomes a retired player record), swap in each `after`, add rookie picks and free agency moves, burn the names of replacements and picks, and destroy undrafted draftees. 13c must also widen the stored-roster age check (`isRoster` accepts ages 20 to 30 only, which fails once a 30-year-old ages to 31 or a draftee is 18).
- Writes: one `put` of this league's plan per operation, through `acceptQueue`; reads fail closed; no franchise, roster, season, retired-player or registry document is written.

## Testing

- Unit tests (`npm test`) for the plan validation, pure rules with scripted dice, and repository operations in steps 1-3, using the injectable rng, `newId` and name pool and the in-memory database. The wizard step logic is covered by its unit tests; the screen itself is checked by reading it against the repository results and by the device check. No browser test command exists. Lint (`npm run lint`) and typecheck (`npx tsc --noEmit`) run before done.

## Notes for the AI

- Expo SDK 57: this feature adds no Expo or native API; if one turns out to be needed, check the versioned docs first.
- Follow the 12a, 12b and 13a pattern exactly: wizard step file, `acceptQueue` writes, fail-closed reads, later writes drop dependent fields.
- Keep rule logic in pure functions with injected rng; no `Math.random()` outside default parameters.
- Do not touch live collections; do not add AI attribution to commits.
- F-02 (old plans feeding the name checks) stays open until 13c deletes plans on approval.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":14240,"specSha256":"287256cc0cc7e50ed804e20c46c38b7dcc9f5d3fd2603c5e22b5cbec4715ce75","branch":"refs/heads/feature/offseason-progression","head":"529c51fbfa0dc02a1f64714601482c0c13ec2c10","baseRef":"refs/heads/main","baseCommit":"529c51fbfa0dc02a1f64714601482c0c13ec2c10","sourceTree":"bb3a17e661c52bfd951a900e3f6b6b44c9b2265e","landing":"local-merge","absentOptional":[]} -->
