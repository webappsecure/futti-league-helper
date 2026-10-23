# Feature: Team control star limits

**From build-plan:** feature 18
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/team-control-star-limits`

## Goal

Keep every team's total control stars between 2 and 6. When a team's roster is generated, and again when the offseason is applied after progression, the team's stars are corrected: a team with fewer than 2 gets stars added to its best position players, a team with more than 6 loses stars from its worst position players that have stars. No player goes below 0 or above 2.

## Decisions (defaults to confirm in review)

- **D1. One star per player per pass.** Adding: go through the position players from best to worst and give each one with fewer than 2 stars a single star, stop the moment the team total reaches 2, and start another pass only if it is still short. Removing: go through the position players that have stars from worst to best, take one star from each, stop the moment the total reaches 6, and start another pass only if it is still over. This is how I read "assign a single star to the top position players" and "one at a time". If you want the best player to take both stars before the second-best gets any (and the reverse for removal), say so.
- **D2. Ranking is deterministic, not random** (this differs from the "then at random" I proposed earlier). Position players are ranked by offense + defense, then by sportsmanship, then by roster order. Reason: the correction is recomputed at approval and in the progression summary, and a random tie-break would have to be stored. For "worst" the ranking is reversed, and a tie goes to the later roster position.
- **D3. Goaltenders have no stars** and are never changed.
- **D4. Where it runs:**
  - `generateRoster`, which covers league generation, team and league rerolls and new teams staged in the offseason.
  - A single-player reroll (`rerollPlayer`): the team is corrected again afterwards.
  - Arrivals: after the promotion or demotion rating adjustment, which rerolls stars.
  - Approval: on each team's final roster (kept and picked players aged and progressed, replacements, rookies). The progression step shows when a team's stars were corrected.
- **D5. Stored dice stay as rolled.** Only `controlStars` changes; `rolls.stars` is left alone, so the dice shown next to a player can differ from the stars after a correction.
- **D6. Existing data is not changed.** Rosters already generated (accepted or not) keep their stars until they are rerolled or the next offseason is approved.

## In scope

- Pure `limitTeamStars(players)` with the constants `MIN_TEAM_STARS = 2` and `MAX_TEAM_STARS = 6`.
- Calls at the four places in D4.
- A line per team in the progression step when approval will correct its stars (before and after totals).
- Tests for all of the above.

## Out of scope

- Any marker on a player showing that stars were corrected.
- Changing stored rolls, charts, or the control-star chart itself.
- Correcting existing rosters or already-staged arrivals and new teams.
- Per-player star rerolls and manual star editing (still not allowed).

## Build loop

`workflow.stepReview` is `feature`: build all steps, run the narrow check per step, then one final review packet. `workflow.checkpointCommits` is `disabled`; `/complete` makes the single commit.

## Build steps

- [x] 1. **Pure rule** in `src/rosters/control-stars.ts`: `limitTeamStars(players)` returns a new array in the same order (input untouched), changing only `controlStars` of standard players as in D1-D3, plus `teamStars(players)`.
  Done when: `control-stars.test.ts` covers: a team already in range is returned unchanged; 0 stars total becomes 2 on the two best players; 1 star total gets one more on the best player with fewer than 2; a best player with 2 stars is skipped; a second pass when the first cannot reach 2 (test with a short list); 12 stars becomes 6 starting from the worst; 7 becomes 6 removing from the worst player with a star; a player never goes below 0 or above 2; tie-breaks by sportsmanship then roster order; goaltenders untouched; `rolls` untouched; `npm test` and `npx tsc --noEmit` pass.
- [x] 2. **Generation.** `generateRoster` and `rerollPlayer` in `src/rosters/roster.ts` return corrected rosters.
  Done when: tests with scripted dice show a generated roster of all-zero stars ending at 2 and one of all-two stars ending at 6, `rerollPlayer` leaves the team in range, and the existing roster, new-team and repository tests pass (update only expectations that depended on uncorrected stars).
- [x] 3. **Arrivals and approval.** `buildArrivals` (via `adjustRoster`'s result) corrects each arriving team. In `src/offseason/approval.ts`, `finalRoster` applies the correction last, and an exported helper reports a team's stars before and after. `progression-step.tsx` shows "Control stars adjusted from N to M" for a team whose stars change.
  Done when: tests show an arriving team ends in range after adjustment, `finalRoster` corrects a team whose progression or rookies push it out of range, a team in range reports no adjustment, the approval repository tests still pass; typecheck, lint and `npm test` pass.
- [x] 4. **Final gate.** Run `npx tsc --noEmit`, `npm run lint`, `npm test`. Remove dead code.
  Done when: all three pass and every step is checked.

## Files / areas

- New: `src/rosters/control-stars.ts` (+ test).
- Changed: `src/rosters/roster.ts` (+ test), `src/offseason/arrivals.ts` (+ test), `src/offseason/approval.ts` (+ test), `src/components/offseason/progression-step.tsx`.
- Reuse: `Stars` type from `src/rules/charts.ts`, existing scripted-dice test helper `rngFromDice`.
- Not touched: `rating-adjust.ts` (it still rerolls stars per player; the team correction runs after it), `player-generation.ts`, storage, wizard step list.

## Data / contracts

- No new stored fields and no migration. Corrected `controlStars` values are written in the same documents as before (rosters, staged arrivals, staged new teams, final rosters at approval).
- `limitTeamStars(players: readonly RosterPlayer[]): RosterPlayer[]` is pure and deterministic. A team with fewer than six standard players is handled (it simply has fewer places to add or remove).
- The preview in the progression step is computed with the same function, so what it shows is what approval writes.

## Testing

- Unit tests as listed. No UI test runner exists, so the progression-step line is checked by reading it against the helper's result; by hand, run progression on a team whose players carry many stars and compare the line with the approved roster.
- `npx tsc --noEmit`, `npm run lint` and `npm test` must pass. No combined Verify command is declared. The last full run (727 tests, tsc and lint clean) was on the current `main`; nothing was re-run for this spec.

## Notes for the AI

- Keep the rule in pure functions; no `Math.random()`; no new dependency.
- Do not change the stored `rolls`.
- Commits carry no AI attribution (AGENTS.md).

## Open questions

None blocking. Please confirm D1 (one star per player per pass) and D2 (deterministic tie-break instead of random).


<!-- blueprint:completion {"schemaVersion":2,"specBytes":7130,"specSha256":"06714dbffba3997c268d516e5626b1b0b9c994e2938cdb24d9376dda30596612","branch":"refs/heads/feature/team-control-star-limits","head":"3f98f08954f012564b11ccde4278868e8968200a","baseRef":"refs/heads/main","baseCommit":"3f98f08954f012564b11ccde4278868e8968200a","sourceTree":"5c50d8bb9434f68fffef74af1690e0fc5ba5adea","landing":"local-merge","absentOptional":[]} -->

## Findings

### 18/F-02 [P3] closed - Plans from earlier seasons would feed the name checks

**File:** src/offseason/offseason-plan-repository.ts:197
**Found:** 2026-10-20 by /audit (scope: current; lens: all)
**Why it matters:** `listStagedNewTeams` reads every document in `offseason-plans`, so once feature 13 applies an offseason and a league has later seasons, old plans (and their staged team and player names) would still count as "used by a staged team". Not reachable today because a league has one season until 13.
**Suggested fix:** When feature 13 applies or archives an offseason, delete its plan, or have the name checks read only plans whose season is still in `offseason`. Confirm this in 13's spec.
**Resolution:** `listOffseasonPlans` in offseason-plan-repository.ts returns only plans of seasons in `offseason`; `listStagedNewTeams` and `unavailableNames` use it (13c step 4).
Re-reviewed 2026-10-22 by /audit (full): `listOffseasonPlans` filters to seasons in `offseason`, both name checks use it, and `rookie-draft-repository.test.ts` and `progression-repository.test.ts` cover it. The defect is gone and the repair added none.
