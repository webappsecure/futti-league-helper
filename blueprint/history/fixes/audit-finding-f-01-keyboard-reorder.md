# Fix: Audit finding F-01 keyboard reorder

**Type:** Fix
**Status:** verified
**Branch:** `fix/audit-finding-f-01-keyboard-reorder`
**Fixes:** F-01

## The problem

The finishing-order list (`src/components/seasons/sortable-list.tsx`) can only be reordered by pointer drag on web. The move up / move down `accessibilityActions` work for screen readers on iOS and Android but react-native-web does not expose them, and the rows are not focusable or key-handled, so a keyboard-only user cannot set or correct the order. F-01 is the only open finding, so "all" is this one.

## The fix

On web only, make each row focusable and handle ArrowUp / ArrowDown on the focused row by calling the existing `onMove(index, index - 1)` / `onMove(index, index + 1)` (ignored at the ends and while disabled), and keep keyboard focus on the moved row after the list re-renders. No new dependency; reuse `reorderTeams` via `onMove`. Native behavior and the drag gesture stay unchanged. Add a visible focus indication on the focused row, and extend the row's accessibility hint on web to mention the arrow keys.

Must not break: drag on web and touch, the native accessibility actions, the disabled state.

## Build steps

- [x] **Step 1 - Keyboard reorder on web** - Add `tabIndex`, `onKeyDown` (ArrowUp / ArrowDown, `preventDefault` so the page does not scroll) and a focus style to the row on `Platform.OS === 'web'`; after a keyboard move, focus the row that now holds the moved team (by id via a ref map or `autoFocus`-style effect keyed on the moved id). Mark F-01 `fixed`. *Done when:* `npx tsc --noEmit`, `npm run lint` and `npm test` pass, and the code path is present only for web (native build unaffected).

## Verify

`npm test`, lint and typecheck. Manual (user, web): Tab to a team row, press ArrowUp / ArrowDown and confirm it moves and keeps focus, the page does not scroll, and drag still works.

## Findings

### audit-finding-f-01-keyboard-reorder/F-01 [P2] closed - Finishing order cannot be changed from the keyboard on web

**File:** src/components/seasons/sortable-list.tsx:84
**Found:** 2026-10-20 by /audit (scope: feature 10 delta, commit 935eb94; lens: all)
**Why it matters:** Reordering is pointer drag only on web. `accessibilityActions` (move up / move down) work for screen readers on iOS and Android, but react-native-web does not expose them and the rows are not focusable or key-handled, so a keyboard-only user cannot set the finishing order or end the season meaningfully. This was disclosed when drag and drop replaced the buttons and not asked for since; the project treats accessibility as non-negotiable.
**Suggested fix:** On web, make each row focusable (`tabIndex={0}`) and handle ArrowUp / ArrowDown (for example with Alt held, or while the row is focused) by calling `onMove(index, index ∓ 1)`, then keep focus on the moved row. Pure logic already exists in `reorderTeams`; no new dependency.
**Resolution:** Web rows are focusable (tabIndex) and ArrowUp/ArrowDown call onMove, with focus restored to the moved row and a focus border. Re-reviewed by /audit 2026-10-20: key handling, focus restore and disabled state read correctly in sortable-list.tsx; no new defect. User confirmed manually on web.


## Verification

- `npm test` (456 passed), `npx tsc --noEmit`, `npm run lint` clean. User confirmed the keyboard reorder on web; re-reviewed by /audit and F-01 closed.
