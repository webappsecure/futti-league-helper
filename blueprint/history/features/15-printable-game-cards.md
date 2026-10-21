# Feature: Printable game cards

**From build-plan:** feature 15
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/printable-game-cards`

## Goal

Print one season's player and goaltender cards for an accepted league on US Letter landscape sheets, four teams per sheet, matching `blueprint/reference/cardsheet.png`. Cards are cut out and used at the tabletop.

## Design reference

- Sheet: [cardsheet.png](../reference/cardsheet.png). Close-ups: [player-card.png](../reference/player-card.png) (standard) and [goaltender-card.png](../reference/goaltender-card.png) (goaltender).
- Backgrounds in `blueprint/reference/`: `background-player-1.gif`, `background-player-2.jpeg`, `background-player-3.jpeg`, `background-goaltender.jpeg`. No `prototypes/` folder exists.

**Sheet geometry.** US Letter landscape (11 x 8.5 in), margins 0.25 in on every side, no headers or footers. Usable area 10.5 x 8 in. Each card is 1.312 in wide by 2 in tall, so 8 cards per row (10.496 in) and 4 rows (8 in). One row per team: 6 standard players then 2 goaltenders, in roster order. A thin gray border on each card acts as the cut guide. A league of 20 teams prints 5 sheets; the last sheet may hold fewer than four rows.

**Card content** (as in the close-ups; the British spellings "OFFENCE" and "DEFENCE" are intentional and must not be changed to American):

- Standard: name in a rounded pill at the top; `OFFENCE:` with a large offense number; a smaller sportsmanship number beside the word `SPORTSMANSHIP`; `DEFENCE:` with a large defense number; control stars (one or two stars, none when 0) centered above the bottom pill; the team's city or name (by the league's naming style) in a rounded pill at the bottom.
- Goaltender: name pill; `GOALTENDING` label over a large rating; `SPORTSMANSHIP` over its value; bottom pill as above. No stars.
- All names are shown in capitals.

**Backgrounds.** A silhouette image sits behind the content at 15% opacity. Per row, by card position: 1-2 `background-player-1.gif`, 3-4 `background-player-2.jpeg`, 5-6 `background-player-3.jpeg`, 7-8 the goaltender background. The second card of each pair uses the same image mirrored horizontally.

**Colors.** Each team uses its primary and secondary colors for the printed season.

- *Enough contrast* (WCAG contrast ratio of at least 2:1 between the two colors): top and bottom pills are filled with the primary color; pill text is the lighter of the two colors; the rating numbers, the sportsmanship number and the stars use the primary color.
- *Not enough contrast* (the Los Cerricos card, red and blue): top pill filled with the primary color, bottom pill filled with the secondary color, both with white text; ratings use the primary color; the sportsmanship number on goaltenders and the stars on standard players use the secondary color (as in the sample row). Label text (`OFFENCE:`, `SPORTSMANSHIP`, etc.) is dark gray in every case.

## In scope

- A pure card-sheet builder: given a league, its season, the franchises and the rosters, produce an HTML document of paginated sheets in the geometry above, with `@page { size: 11in 8.5in; margin: 0.25in }`.
- Pure helpers: `contrastRatio(hexA, hexB)`, `cardColors(primary, secondary)` returning the color roles, and `backgroundFor(position)` returning the image key and a mirrored flag.
- HTML-escaping of every user-controlled string (player names, team names) so they render as text only.
- A "Print cards" action on an accepted league's detail screen (hidden or disabled with an explanation when the league has no season), showing a busy state, success or an error message that clears on the next try.
- Print/export path per platform: web opens the generated document in a print dialog; iOS and Android render it to a PDF and open the system print or share sheet.
- Team identity per season: the identity in effect for the season index (`identityForSeason`). The bottom pill shows the identity's `city` when the league's naming style is `cityAndName`, and its `name` when the style is `nameOnly`.
- Copy the four background images into `assets/images/cards/` so the app can load them.
- Unit tests for the pure logic.

## Out of scope

- Printing any season other than the league's current accepted one (rosters are not season-scoped until the season archive, feature 10); the builder takes the season index as input so later seasons can reuse it.
- Preview rendering inside the app, custom paper sizes, A4, duplex or bleed marks, per-player or per-team printing, custom fonts, editing card content.
- Exporting card images or a PDF as a saved file beyond the platform print/share sheet.
- Photographs or generated art; only the provided backgrounds.

> **Revision after review:** card text now uses Open Sans (variable font, width 75%) embedded from `assets/fonts/OpenSans-Variable.ttf`; offense and defense values are 40pt weight 800. Other font sizes are unchanged pending further review.

> **Revision during build:** measured on `cardsheet.png`, Escanola's colors have a ratio of 2.24 and Los Cerricos' 1.66, so the 3:1 threshold would have given Escanola the Los Cerricos look. The threshold is 2:1, which separates all four samples.

## Build loop

`workflow.stepReview: feature`: build every step, run the final check once, present one review packet. `checkpointCommits` is disabled; `/complete` makes the commit.

## Build steps

- [x] 1. **Card rules (pure).** Add `src/cards/card-colors.ts` with `contrastRatio` (WCAG relative luminance), `CONTRAST_MIN = 2`, `cardColors(primary, secondary)` returning `{ pillFill, pillText, topFill, bottomFill, number, sportsmanship, stars }` per the Colors rules, and `src/cards/card-layout.ts` with the geometry constants (inches), `backgroundFor(position: 0-7)` returning `{ image: 'player1' | 'player2' | 'player3' | 'goalie', mirrored }`, and `paginate(teamCount)` returning rows grouped four to a sheet. Done when `card-colors.test.ts` and `card-layout.test.ts` cover: contrast of black/white is 21 and identical colors 1; sample pairs approximating La Pinosa (purple, gold), Escanola (green, light green) and San Mateo (black, light blue) are "enough", Los Cerricos (red, blue) is "not enough", with the sample hexes taken from `cardsheet.png`; lighter-color pill text; positions 0-7 map to the four images with positions 1, 3, 5, 7 mirrored; 4 teams is 1 sheet, 5 is 2, 20 is 5, 0 is 0. `npm test` for those files passes.
- [x] 2. **Sheet HTML builder (pure).** Add `src/cards/build-card-sheets.ts`: `buildCardSheets({ league, seasonIndex, franchises, rosters, images })` returning `Result`-style `{ ok: true, html, pages } | { ok: false, reason }`. `images` maps each image key to a data URI string (injected so the function stays pure). Rows follow the team list order; each roster must have 6 standard and 2 goaltenders in that order else `invalid-roster`; a team with no identity for the season or no roster is a `missing-data` error and nothing is built. Mirroring is a CSS `scaleX(-1)` on the background layer only (text never mirrored); opacity 0.15 on that layer; card box sized in `in` units; one `section` per sheet with `break-after: page`. Done when `build-card-sheets.test.ts` covers: card and sheet counts for 1, 4, 5 teams; geometry values appear in the CSS; each card's text content, rating numbers and stars (0, 1, 2); goalie cards have no stars; bottom pill shows the city for a cityAndName league and the name for a nameOnly league, in capitals; both color modes applied to the right elements; mirrored class on the second card of each pair only; names like `O'Brien <b>` and `A&B` are escaped; missing roster, malformed roster and missing identity each fail with nothing built. `npm test` passes.
- [x] 3. **Assets and print adapters.** Copy the four backgrounds to `assets/images/cards/` (keep names). Install `expo-print` via `npx expo install expo-print` (and `expo-asset` / `expo-file-system` only if SDK 57 docs require them for reading bundled images as base64; confirm in the versioned docs first). Add `src/cards/load-card-images.ts` that returns the four data URIs (cached after first load) and `src/cards/print-cards.ts` / `print-cards.web.ts` exposing `printHtml(html): Promise<Result<void>>`. Native: `Print.printAsync({ html, width: 792, height: 612 })` (US Letter landscape in points); web: render into a hidden iframe or new window and call `print()` (web `printAsync` prints the current page, so it is not used there). Done when `npx tsc --noEmit` and `npm run lint` pass for both platform files; I/O itself is checked by hand in step 5.
- [x] 4. **Print action in the UI.** Add a Print cards button to the league detail for an accepted league (`src/components/leagues/league-detail.tsx`, with the logic in a small `src/cards/use-print-cards.ts` hook): loads franchises, rosters and the season through the existing repositories and the `useLeagueSeason` state, builds the sheets, prints, and shows busy, error (alert role) and no-season states; no button action runs while a print is in progress. Done when lint and `tsc` pass and, on web, an accepted league prints a preview matching `cardsheet.png` while an unaccepted league shows no working print action.
- [x] 5. **Final check.** *(409 tests, lint and tsc pass; web print preview checked by the user, who approved the card design. Native print not verified.)* Run `npm test`, `npm run lint` and `npx tsc --noEmit` once. On web, print preview a league of 5 or more teams to PDF at 100% scale with default margins off, and verify: Letter landscape, four team rows on sheet 1 and the fifth on sheet 2, nothing clipped, cards measure about 1.312 x 2 in, mirrored backgrounds on the second card of each pair, the Los Cerricos-style color mode for a red/blue team and the primary-pill mode for a purple/gold team. Native print is checked on a dev build only if one is available; say plainly if not run. Done when all three commands pass and the manual results are recorded.

## Files / areas

- New: `src/cards/card-colors.ts`, `card-layout.ts`, `build-card-sheets.ts`, `load-card-images.ts`, `print-cards.ts`, `print-cards.web.ts`, `use-print-cards.ts` and tests for the three pure modules; `assets/images/cards/*`.
- Edited: `src/components/leagues/league-detail.tsx`, `package.json` / `package-lock.json` (expo-print and any docs-required peers), possibly `app.json`.
- Reused unchanged: `identityForSeason`, `displayName`, `listFranchises`, `listRosters`, `getLeagueSeason`, `Button`, `Result`.

## Data / contracts

- Input data is read-only: no new stored fields, no schema change.
- Team color fields are `#rrggbb` (validated by `normalizeHexColor`); a stored color that is not valid hex fails the build with `missing-data` instead of printing wrong colors.
- Roster order is the contract that decides card position: indexes 0-5 are standard players, 6-7 are goaltenders.
- Output is one self-contained HTML string (images inlined as data URIs) so both print paths receive the same document.

## Testing

- Pure modules are covered by unit tests, including the HTML text, escaping, geometry and color modes.
- Layout fidelity (physical size, page breaks, mirrored artwork, fonts) can only be judged visually; it is checked by hand in the browser print preview and recorded in the final check. No claim of native or physical-print verification unless run.

## Notes for the AI

- Fetch the SDK 57 pages for `expo-print` (and `expo-asset` / `expo-file-system` if needed) before step 3. Documented: `printAsync` and `printToFileAsync` accept `html`, `width`, `height` in points (default 612 x 792); `margins` and `orientation` are iOS only, so landscape is expressed through `width` > `height` and the HTML `@page` rule. On web `printAsync` prints the current page, so a separate web adapter is required.
- Use inches in CSS for the card and sheet boxes; do not use React Native styles for the sheet (it is an HTML document, not an app screen).
- Escape all user text. Do not interpolate raw names into HTML or CSS.
- Fonts: use a bold condensed system stack (for example `"Arial Narrow", "Roboto Condensed", Arial, sans-serif`) and shrink-to-fit the pill text with a fixed small font size for long names; embedding a custom font is out of scope.
- Keep contrast math in the pure module so the threshold (2:1, a single constant) can be tuned without touching layout.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":12360,"specSha256":"838c38d2e93ce3137cbb9dca3efc11190834d06a7898249f861f8486a4c4a3b7","branch":"refs/heads/feature/printable-game-cards","head":"f78427f453e3e9038d7d48a92c2e85e9207d6e92","baseRef":"refs/heads/main","baseCommit":"f78427f453e3e9038d7d48a92c2e85e9207d6e92","sourceTree":"0fbd11c7cea094a494622e1e2749f07b01796dbe","landing":"local-merge","absentOptional":[]} -->

## Try it now

Guide for human review; it is not verification. Run `npm run web`, open an accepted league with at least five teams and click **Print cards**. In the print dialog choose Letter, landscape, margins None, scale 100%.

- Sheet 1 shows four team rows of eight cards (six players, two goaltenders), and sheet 2 shows the fifth team.
- Offense and defense values are large; names and the city or team name sit in rounded pills; control stars appear above the bottom pill.
- The second card of each pair has a mirrored background, and the goaltender cards use the new silhouette.
- A purple/gold team and a red/blue team use different color treatments, and a long name is squeezed to fit its pill.

Not run: native iOS or Android printing (cancelling the iOS dialog should show no error).
