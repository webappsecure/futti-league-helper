# Feature: Save game cards as PDF

**From build-plan:** feature 16
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/save-game-cards-as-pdf`

## Goal

On iOS and Android, let the user save the season's printable game cards (feature 15) as a PDF file through the system share sheet (Save to Files, Drive, AirDrop, email, etc.). The PDF is the same US Letter landscape sheets that printing produces. Web keeps using the browser print dialog, which already offers "Save as PDF".

## In scope

- A native-only "Save cards as PDF" button next to "Print cards" in the Game cards section of the league detail screen (accepted leagues only, same visibility rule as Print cards).
- Render the existing `buildCardSheets` HTML to a PDF file with `expo-print` `printToFileAsync` (same page size as printing), then open the share sheet with `expo-sharing` `shareAsync`.
- Reuse the existing data load and card build in `use-print-cards.ts` for both actions, with one-at-a-time busy handling shared by both buttons.
- A readable file name such as `<league name> season <n> cards.pdf` (sanitized) instead of the random cache file name.
- Loading ("Preparing..."), error and cancelled states consistent with Print cards.

## Out of scope

- Any change to card layout, fonts, colors or HTML (feature 15 tuned those; reuse as is).
- A web PDF button or generating PDFs on web (the print dialog stays).
- Per-team or per-sheet PDFs, page-size options, or saving into a chosen folder without the share sheet.
- Export and import of league data (feature 9).

## Build loop

Build one small step at a time. `workflow.stepReview` is `feature`: produce one review packet after all steps. `workflow.checkpointCommits` is disabled. `/complete` makes the final feature commit.

## Build steps

- [x] **Step 1 - Dependency and pure file-name helper** - Run `npx expo install expo-sharing`. Add a pure `pdfFileName(leagueName, seasonIndex)` in `src/cards/` that strips characters illegal in file names (`/ \ : * ? " < > |` and control characters), collapses whitespace, trims, falls back to `Game cards` if the league name is empty after cleaning, caps the length, and returns `<name> season <n> cards.pdf`. Season number display must match what the UI shows for `season.index` (check how the UI numbers seasons; do not assume 0 or 1 based). *Done when:* `pdfFileName` unit tests pass (illegal characters, empty name, long name, spaces) and `npx tsc --noEmit` and `npm test` pass.
- [x] **Step 2 - Native PDF writer** - Add `src/cards/save-cards-pdf.ts` exporting `savePdf(html, fileName)` returning `Result<void>`: `Print.printToFileAsync({ html, width, height })` using the same `SHEET_WIDTH_IN * 72` / `SHEET_HEIGHT_IN * 72` as `print-cards.ts`, move or copy the result to `fileName` in the cache directory with `expo-file-system` (verify the SDK 57 file API in the versioned docs first; if the rename fails, share the original uri rather than failing), then `Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Save game cards' })`. If `Sharing.isAvailableAsync()` is false, return a failure with a plain message. Dismissing the share sheet is not an error. Add `save-cards-pdf.web.ts` that returns a failure saying PDF saving is native only (never reached, but keeps the web bundle from loading native-only modules). *Done when:* typecheck and lint pass and the web bundle still resolves; behavior is exercised in step 4.
- [x] **Step 3 - Hook and button** - Generalize `usePrintCards` so one `run` builds the HTML once and then either prints or saves the PDF. Expose `print` and `savePdf` with a shared `busy` flag (`running` ref guards both) and a label for which action is busy. Add the "Save cards as PDF" button in `league-detail.tsx` rendered only when `Platform.OS !== 'web'`, disabled while busy, showing "Preparing..." for the active action. Update the Game cards helper text and the error prefix so it reads correctly for both actions (e.g. "Could not print cards." vs "Could not save the PDF."). *Done when:* on native the button appears only for accepted leagues, both buttons disable while either runs, and on web only Print cards shows; lint, typecheck and `npm test` pass.
- [x] **Step 4 - Device check** - Run on an iOS and an Android device or simulator in a development build (do not start or poll a dev server from the agent; the user runs it). Save the PDF to Files, open it and confirm it has the same sheets as the print preview (landscape Letter, backgrounds, fonts, 4 teams per sheet) and the readable file name. Confirm dismissing the share sheet shows no error. *Done when:* the user confirms the PDF output on at least one platform and any layout difference from printing is either fixed or recorded here.

## Files / areas

- `package.json` / `package-lock.json` (add `expo-sharing` via `npx expo install`).
- `src/cards/pdf-file-name.ts` and test (new).
- `src/cards/save-cards-pdf.ts`, `src/cards/save-cards-pdf.web.ts` (new, mirror the `print-cards.ts` / `.web.ts` split).
- `src/cards/use-print-cards.ts` (generalize; consider renaming only if it stays small, otherwise keep the name).
- `src/components/leagues/league-detail.tsx` (second button, copy).
- Reuse unchanged: `build-card-sheets.ts`, `load-card-assets.ts`, `card-layout.ts`, `print-cards.ts`.

## Data / contracts

- No persisted data or schema changes. The PDF is a temporary cache file handed to the share sheet; nothing is stored in the app.
- `savePdf(html: string, fileName: string): Promise<Result<void>>`, using the existing `Result` from `@/storage/types`.
- File name: `<sanitized league name> season <n> cards.pdf`. League names are user text, so sanitizing is required before they are used in a file path. Error text is rendered as plain text.
- PDF page size matches printing: US Letter landscape, `SHEET_WIDTH_IN * 72` by `SHEET_HEIGHT_IN * 72` points.

## Testing

- Unit: `pdfFileName` (pure), per step 1. No new tests for the share and print wrappers (native modules; same approach as `print-cards.ts`, which has none).
- Manual: step 4 on a real iOS and Android build. Expo Go includes `expo-print`, `expo-sharing` and `expo-file-system`, so Expo Go can be used if the app already runs there. No browser tests are configured and the web path is unchanged apart from the hidden button.
- Gate: `npm test`, `npm run lint`, `npx tsc --noEmit`.

## Notes for the AI

- Expo SDK 57: read the versioned docs (`https://docs.expo.dev/versions/v57.0.0/sdk/print/`, `sharing/`, `filesystem/`) before writing code; do not use remembered APIs. `printToFileAsync` saves to the cache directory under a generated name and returns `{ uri, numberOfPages }`.
- iOS WebView printing cannot load local asset URLs; the card HTML already inlines images and fonts for `printAsync`, so it should work, but confirm in step 4 that backgrounds and fonts appear in the PDF.
- On Android, page margins come from `@page` CSS; the existing HTML already sets the sheet layout, so check that no extra margin or blank pages appear.
- iPad: pass no `anchor` unless the share sheet fails to appear on iPad; if so, anchor it to the button.
- Keep the card look as tuned (see memory `project-printable-cards`): no layout, font or color changes in this feature.
- Do not add AI attribution beyond what the project instructions allow.

## Open questions

None blocking. Default chosen: the PDF button is native-only and web keeps the print dialog, per the plan line.

## Verification

- `npm test` (426 passed), `npx tsc --noEmit` and `npm run lint` clean.
- Device check (step 4): the user confirmed on tablets that saving the PDF works. Dismissal behavior and iPad anchoring were not separately reported.
- `expo-sharing` added; its auto-added config plugin in `app.json` was reverted (it only configures receiving shares).
