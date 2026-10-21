# Fix: Audit finding F-01

**Type:** Fix
**Status:** verified
**Branch:** `fix/audit-finding-f-01`
**Fixes:** F-01

## The problem

`pdfFileName` in `src/cards/pdf-file-name.ts` caps the league name with `.slice(0, 80)`, which counts UTF-16 units. A name over 80 characters with an emoji or other astral character at the cut leaves a lone surrogate in the PDF file name, which can break the rename (the code then shares the generated name). F-01 is the only open finding, so "all" is this one.

## The fix

Cut by code points instead of UTF-16 units: `Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('')`. No other behavior changes (illegal-character stripping, whitespace collapse, dot trimming, fallback name).

## Build steps

- [x] **Step 1 - Cut by code points** - Change the cap in `pdf-file-name.ts` and add a test with a long name whose 80th character is an emoji. *Done when:* the new test passes (result has no lone surrogate and is at most 80 code points), existing `pdfFileName` tests still pass, and `npm test`, `npm run lint` and `npx tsc --noEmit` are clean. Mark F-01 `fixed`.

## Verify

Run `npm test`; the new test covers the case. No device check needed.

## Findings

### audit-finding-f-01/F-01 [P3] closed - Long file names can be cut inside an emoji

**File:** src/cards/pdf-file-name.ts:9
**Found:** 2026-10-15 by /audit (scope: src/cards + league-detail, feature 16 delta; lens: all)
**Why it matters:** `.slice(0, 80)` counts UTF-16 units, so a league name with an emoji or other astral character at position 80 leaves a lone surrogate in the file name. Reachable only with a name over 80 characters; the likely outcome is a garbled name or a failed rename (the code then shares the generated name).
**Suggested fix:** Cut by code points, e.g. `Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('')`, and add one test.
**Resolution:** Cap now cuts by code point (Array.from); emoji-at-cap test added. Re-reviewed by /audit 2026-10-15: code-point cut confirmed in pdf-file-name.ts, no new defect; test passes.


## Verification

- `npm test` (427 passed), `npx tsc --noEmit`, `npm run lint` clean. Re-reviewed by /audit; F-01 closed.
