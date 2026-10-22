# Fix: Reserve draftee names for new teams and tighten rookie tests

**Type:** Fix
**Status:** verified
**Branch:** `fix/reserve-draftee-names-and-tighten-rookie-tests`
**Fixes:** F-03, F-04

## The problem

- **F-03 (P2):** in `src/offseason/offseason-plan-repository.ts`, `unavailablePlayerNames` reserves burned names and names on other staged new teams, but not the names in any plan's `draftPool` (added in 13a). The draft pool generator already avoids new-team names, so the check is one-way. After the pool exists, going Back to New teams and adding or rerolling a team can give a player the same name as a draftee; approval (13c) would then burn two players with one name.
- **F-04 (P3):** in `src/offseason/rookie-draft-repository.test.ts`, the `kind-not-needed` assertion sits behind `if (wrong !== undefined)` and can be skipped silently, and the new `PlanError` kinds (`free-agency-incomplete`, `pool-not-generated`, `picks-exist`, `kind-not-needed`) have no direct `planErrorText` test.

F-02 (unverified, old plans feeding the name checks) is not repaired here; it stays in the ledger for 13c.

## The fix

- `unavailablePlayerNames` also adds the name of every player in every saved plan's `draftPool`. `listStagedNewTeams` already reads every plan and fails closed on an unreadable one; extend it (or read the same list once) rather than adding a second pass over the plans collection. Add the names for the new-team add and reroll paths alike. The `except` team id still excludes only that new team's own players. No behavior is removed: only names that were silently reusable become unavailable.
- Tests:
  - In `src/offseason/offseason-new-teams-repository.test.ts`, after writing a `draftPool` into the plan (generated with `generateDraftStandard`/`generateDraftGoalie`), `addNewTeam` and `rerollNewTeam` with a name pool made of only those names return `no-names`, and with an extra free name use it and never a draftee's name. Include a draftee in another league's plan.
  - In `src/offseason/rookie-draft-repository.test.ts`, make the `kind-not-needed` case throw when no wrong-kind draftee exists instead of skipping, and add a short test that every `PlanError` kind returns non-empty `planErrorText`.
- No new abstraction, dependency or configuration surface.

## Build steps

- [x] **Step 1 - Reserve draftee names and fix the tests** - Make the changes above. *Done when:* the new tests fail on the old code and pass on the new, and lint, `npx tsc --noEmit` and `npm test` pass.

## Verify

- Automated: `npm test`, `npx tsc --noEmit`, `npm run lint`.
- Manual (optional, user): generate a draft pool, go back to New teams and add a team; its players never share a name with a draftee.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":2713,"specSha256":"68a5b1209b41966429d84e1028cfa9779b2ffbd6819706a83929b63f0c56ef4c","branch":"refs/heads/fix/reserve-draftee-names-and-tighten-rookie-tests","head":"9b01114aaaee51fe822a9dfedee7bf9f647f76f7","baseRef":"refs/heads/main","baseCommit":"9b01114aaaee51fe822a9dfedee7bf9f647f76f7","sourceTree":"9df42fe41c1e13591a8672da2fc7860d3ad10c9a","landing":"local-merge","absentOptional":[]} -->

## Findings

### reserve-draftee-names-and-tighten-rookie-tests/F-03 [P2] closed - A new team can be given a name already held by a staged draftee

**File:** src/offseason/offseason-plan-repository.ts:282
**Found:** 2026-10-21 by /audit (scope: full, partial; lens: all)
**Why it matters:** `unavailablePlayerNames` reserves burned names and names on other staged new teams, but not the names in any plan's `draftPool`. The draft pool generator (13a) does reserve staged new-team names, so the check is one-way. Reachable: generate the pool, press Back to the New teams step, add or reroll a new team; its players can reuse a draftee's name. `writeNewTeams` also keeps the existing `draftPool`. When 13c burns names on approval, two players would share a name, which breaks the "no duplicate names across history" rule.
**Suggested fix:** Also add the names of every saved plan's `draftPool` (all plans, as `unavailableNames` in `rookie-draft-repository.ts` already does) to the set in `unavailablePlayerNames`, with a test that adds a new team after a pool exists. Nothing is lost; it removes no behavior. Optionally share one name-collection helper between the two files. Confirm alongside F-02 in 13c.
**Resolution:** `unavailablePlayerNames` now also reserves every saved plan's draftee names; new test fails on the old code. Closed 2026-10-21: re-reviewed `listStagedNewTeams`, `unavailablePlayerNames` and the add and reroll callers; the one-way gap is gone and the change adds no new defect.

### reserve-draftee-names-and-tighten-rookie-tests/F-04 [P3] closed - Rookie pick error test can skip its kind-not-needed assertion

**File:** src/offseason/rookie-draft-repository.test.ts:231
**Found:** 2026-10-21 by /audit (scope: full, partial; lens: tests)
**Why it matters:** `if (wrong !== undefined) expect(...)` makes the `kind-not-needed` check conditional, so it passes silently if the fixture ever produces a clock team that needs both kinds. `planErrorText` for the new error kinds (`free-agency-incomplete`, `pool-not-generated`, `picks-exist`, `kind-not-needed`) also has no direct test.
**Suggested fix:** Throw when `wrong` is undefined (or pick a fixture that guarantees one), and add a short test that every `PlanError` kind returns non-empty text.
**Resolution:** The kind-not-needed assertion now throws when the fixture has no wrong-kind draftee, and a `planErrorText` test covers the rookie draft errors. Closed 2026-10-21: re-reviewed the test file; the assertion can no longer be skipped.
