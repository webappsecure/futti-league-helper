# Fix: Audit findings F-01, F-02 and F-03

**Type:** Fix
**Status:** verified
**Branch:** `fix/audit-findings-f-01-and-f-02`
**Fixes:** F-01, F-02, F-03

## The problem

- **F-01 [P2, unverified]** `generateLeagueRosters`, `rerollLeague`, `rerollTeam` and `rerollPlayer` in `src/rosters/roster-repository.ts` check `lockFailure` and then write without running through `acceptQueue`. `renamePlayer` and `acceptLeague` do. A roster write that passed the lock check just before an accept could land after the names were burned, leaving unburned names on a locked league. The UI makes the overlap hard to reach, but the repository does not guarantee it.
- **F-02 [P3, open]** `src/cards/build-card-sheets.test.ts` asserts many exact CSS declarations (per-class font sizes, nudge offsets, rule order). A harmless restyle fails them without changing the printed card, and they mostly mirror the implementation.
- **F-03 [P3, unverified]** `createFranchise`, `updateFranchise` and `deleteFranchise` in `src/teams/franchise-repository.ts`, and `updateLeague` and `deleteLeague` in `src/leagues/league-repository.ts`, check the lock and then write without `acceptQueue`. Accept reads the teams and rosters, then writes the season; a team delete (or league delete) landing in between could leave an accepted league with a missing team, or a season for a deleted league. The UI makes this hard to reach, but the repository does not guarantee it.

## The fix

- **F-01.** Run the four roster-writing functions through `acceptQueue` exactly as `renamePlayer` does: the exported function enqueues a private implementation, and the private implementations never call an exported queued function (a nested enqueue would deadlock). Behavior, return types and error kinds are unchanged. Nothing outside `roster-repository.ts` changes.
- **F-02.** Keep the tests on content, escaping, pagination, mirroring, color modes, identity-by-season and failure cases. Reduce the CSS-string assertions to those that encode a requirement: page size and margin, card size, 15% background opacity, the font faces being embedded, and the 75% pill scale. Remove the per-class font-size, nudge-offset, stretch and `justify-content` assertions. No product code in `src/cards` changes.
- **F-03.** Same pattern as F-01: the five exported functions enqueue private implementations on `acceptQueue`, and the implementations call no queued function. `createLeague` and the league-link functions are not part of this (no lock check to go stale). Signatures, return types and error kinds are unchanged.
- Must not break: the existing 8b behavior that rename and accept never interleave, all current roster-repository tests, and the card output itself.

## Build steps

- [x] 1. **Serialize roster writes with accept (F-01).** In `src/rosters/roster-repository.ts` wrap `generateLeagueRosters`, `rerollLeague`, `rerollTeam` and `rerollPlayer` in `acceptQueue` like `renamePlayer`. Add tests in `roster-repository.test.ts`: a reroll (team, player and league) and a generate started together with `acceptLeague` either complete before the accept (and the accept burns the new names) or fail `locked`; the accepted league's rosters are never changed after the season exists; a reroll queued behind a held accept sees the lock. Done when those tests pass, and temporarily bypassing the queue in one function makes its test fail; `npm test`, `npm run lint` and `npx tsc --noEmit` pass.
- [x] 2. **Trim brittle card tests (F-02).** Edit `src/cards/build-card-sheets.test.ts` as described above. Done when the file still covers every behavior listed under The fix, the removed assertions are only CSS-string checks of font size, offset, stretch and layout nudges, and `npm test`, lint and `tsc` pass.
- [x] 3. **Serialize team and league writes with accept (F-03).** Wrap `createFranchise`, `updateFranchise`, `deleteFranchise` (franchise-repository) and `updateLeague`, `deleteLeague` (league-repository) in `acceptQueue` as in step 1, first confirming that none of them, nor anything they call, calls another queued function (a nested enqueue deadlocks). Add race tests next to the existing ones in `accept-league.test.ts`: a team delete, a team update and a league delete each started together with `acceptLeague` either land before the accept or fail `locked`, and an accepted league never ends with a missing team or an orphan season; creating a team behind a held accept sees the lock. Done when those tests pass, bypassing the queue in `deleteFranchise` and `deleteLeague` makes their tests fail, and `npm test`, `npm run lint` and `npx tsc --noEmit` pass.

## Verify

- `npm test`, `npm run lint` and `npx tsc --noEmit` pass.
- Run `/audit current` afterwards so F-01 and F-02 can move from `fixed` to `closed`.
- No manual check is needed: the printed cards and the roster screens are unchanged.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":4855,"specSha256":"2579789fdcca9064d1ce9940cb58e9ae64237044609ff982722682f3e79b29ce","branch":"refs/heads/fix/audit-findings-f-01-and-f-02","head":"b70076fadad8376fbde3248dd7153a4581553040","baseRef":"refs/heads/main","baseCommit":"b70076fadad8376fbde3248dd7153a4581553040","sourceTree":"64dbd1b8a06c678034e561294eaf3e93a5b26e94","landing":"local-merge","absentOptional":[]} -->

## Findings

### audit-findings-f-01-f-02-and-f-03/F-01 [P2] closed - Rerolls and roster generation are not serialized with accept

**File:** src/rosters/roster-repository.ts:114
**Found:** 2026-10-15 by /audit (scope: full; lens: all)
**Why it matters:** `generateLeagueRosters`, `rerollLeague`, `rerollTeam` and `rerollPlayer` check `lockFailure` and then write without running through `acceptQueue`, while `renamePlayer` and `acceptLeague` do (8b F-07). A reroll that passed the lock check before an accept could write new rosters after the accept burned the old names, leaving unburned names on a locked league. The UI disables buttons while one roster action is busy and the review screen is a separate view, so a real overlap was not shown to be reachable.
**Suggested fix:** Run the four roster-writing functions through `acceptQueue` like `renamePlayer`, and add a test that a reroll started with an accept either lands before it or fails `locked`. None of the current behavior would be lost.
**Resolution:** `rerollLeague`, `rerollTeam`, `rerollPlayer` and `generateLeagueRosters` now run through `acceptQueue`. New tests in `accept-league.test.ts` show each reroll either lands before an accept (and its names are burned) or fails `locked`; bypassing the queue makes them fail for the three rerolls. Generate cannot actually race harmfully (accept needs every roster, so it writes nothing once accept can succeed); it is queued for uniformity. Re-reviewed 2026-10-15 (/audit current): the four exports enqueue private `*Now` implementations that call no queued function (no deadlock), signatures and return types are unchanged (`tsc` clean, UI call sites unchanged), and the race tests fail when the queue is bypassed for the three rerolls. No new defect introduced.

### audit-findings-f-01-f-02-and-f-03/F-02 [P3] closed - Card sheet tests assert exact CSS and HTML strings

**File:** src/cards/build-card-sheets.test.ts:117
**Found:** 2026-10-15 by /audit (scope: full; lens: all)
**Why it matters:** Several tests match literal CSS declarations (offsets, font sizes, class order such as `\.stat-label \{ font-size: 14pt; ...`). Any harmless restyle, such as reordering a rule, fails them even though the printed card is unchanged, and they mostly mirror the implementation. Layout fidelity cannot be asserted in unit tests, so the useful ones are those on content, escaping, mirroring and error cases.
**Suggested fix:** Keep the content, escaping, pagination, mirroring and failure-case tests. Reduce the CSS-string assertions to the few that encode a requirement (card and page size, 75% pill scale, 15% opacity), or drop them; no requirement is lost because the visual result is checked by hand.
**Resolution:** Removed the per-class font-size, offset, stretch and layout CSS assertions from `build-card-sheets.test.ts`; kept content, escaping, pagination, mirroring, color-mode, identity and failure tests, plus page size, card size, 15% opacity, embedded fonts and the 75% pill scale. Re-reviewed 2026-10-15 (/audit current): the remaining tests cover content, escaping, pagination, mirroring, color modes, identity and failures plus the requirement-level CSS checks; no coverage of a behavior was lost.

### audit-findings-f-01-f-02-and-f-03/F-03 [P3] closed - Team and league writes are not serialized with accept

**File:** src/teams/franchise-repository.ts:121
**Found:** 2026-10-15 by /audit (scope: current; lens: all)
**Why it matters:** `createFranchise`, `updateFranchise`, `deleteFranchise`, `updateLeague` and `deleteLeague` check the lock and then write without `acceptQueue`, the same pattern F-01 fixed for rosters. A team delete that lands between accept's read of the teams and its season write could leave an accepted league with a missing team. The UI disables team edit and delete until the season is known, and accept is on a separate view, so no reachable overlap was shown.
**Suggested fix:** Run those writes through `acceptQueue` as the roster writes now do, with a race test like the one in `accept-league.test.ts`. None of the current behavior would be lost.
**Resolution:** `createFranchise`, `updateFranchise`, `deleteFranchise`, `updateLeague` and `deleteLeague` now run through `acceptQueue` (private `*Now` implementations, no nested queued calls). Race tests in `accept-league.test.ts` fail when the queue is bypassed for `deleteFranchise`, `updateFranchise`, `createFranchise` and `deleteLeague`; `updateLeague` is queued without its own race test. Re-reviewed 2026-10-15 (/audit current): the five exports enqueue private `*Now` implementations; none of them or the helpers they call (`listFranchises`, `listChainTeams`, `getLeagueSeason`, `listLeagues`, `getLeague`) calls a queued function, and `accept-queue` imports only the serial queue, so there is no deadlock or import cycle. Signatures and call sites in the forms, team list and league list are unchanged (`tsc` clean). No new defect introduced.
