# Fütti League and Game Tracker - Project Overview

<!-- blueprint:source-hash 80998bd7335f60e17ecb0e6b1b662f750a0059f734e2183347502f96827e8277 -->

> A commissioner's tool (Expo / React Native, local-first) for creating and running leagues of the fictional futsal-style sport Fütti: dice-chart roster generation, a promotion and relegation offseason, and permanent franchise, player and season history. It never simulates matches.

## Problem

Fütti is a made-up sport with a tabletop dice-and-card game. Running a whole league by hand (generating rosters from dice charts, then an offseason of promotion and relegation, aging, retirement, free agency, drafts and progression) is slow and error-prone. The app does that bookkeeping exactly per the charts and preserves history. Games are always played on the tabletop; scoring them in-app is a later phase.

## Users

One commissioner running one or more leagues, possibly for a small circle of friends. The commissioner makes every decision and every draft pick for every team. No accounts, per-team owners, or private views.

## Usage model

- Single user, local data, trusted environment. No security or compliance requirements beyond not losing data.
- Data-loss prevention matters: export/import, delete confirmation, locked accepted state.
- Scale: up to 20 teams per league, a few linked leagues, many seasons of history.
- Non-requirements: multi-user, accounts, sync, simulation, store releases.

## Features

Build order (details come per `/feature`); numbers are stable IDs, so 15 is built right after 9, 16 right after 15 and 17 right after 12a and 18 right after 13. Headline: the offseason (11-13).

1. **App shell and local storage** - navigation, master-detail layout, theme, native + web persistence, schema versioning, unit test runner.
2. **Rating and dice engine** - pure, tested dice, chart, split, star and goaltending base-6 logic.
3. **League management** - create/edit/delete leagues (size, naming style, relegation settings).
4. **Teams and franchises** - city, name, colors, grade; franchises with per-season identity.
5. **Linked leagues** - league above/below, enforced matching counts and naming style.
6. **Initial roster generation** - 6 players + 2 goalies per team, dice shown, rerolls per player/team/league.
7. **Accept league** - review, accept, lock rerolls; becomes the first season.
8. **Name list and registry** - provided list, random last names, manual override, permanent burning.
15. **Printable game cards** - per-season cards (samples and backgrounds to be provided).
16. **Save game cards as PDF** - save the printable cards to a PDF file on iOS and Android (share sheet / Save to Files); web keeps the print dialog.
10. **Season archive and finishing order** - manual finishing order, historical snapshot.
11. **Offseason: promotion and relegation** - departing teams, new/existing/former replacements, grade rolls, rating adjustments.
12a. **Offseason: protection, aging and release** - protect one, age, retire the oldest unprotected, release one at random (staged in the plan).
17. **Offseason wizard** - replaces the Offseason card with step-by-step screens (departures, arrivals, new teams, protection, aging and release), Back/Next, resumable from the saved plan.
12b. **Offseason: free agency draft** - draft from the released pool, best finisher first.
13. **Offseason: draft and progression** - draft pool, rookie draft, progression, approval.
18. **Team control star limits** - each team's total control stars kept between 2 and 6 (add to the best position players, remove from the worst, max 2 each) when generated and again after progression; built after 13.
14. **Franchise and player history** - franchise timeline with identity changes, retired players.
9. **Export and import** - single file moves data between devices, merging name registries. Built last.

Later, not MVP (model must leave room): scheduling, scoring tabletop games, standings, player/goalie stats, divisions and conferences, player legacy honors and career totals.

## Data model

> Field names are a proposal derived from the plans; lock them in feature 1/3/4. Shapes that later features depend on: identity-per-season, season-scoped membership/roster, player records that outlive teams, and the burned-name registry.

### League

- `id`, `name`
- `size` (6|8|10|12|14|16|18|20)
- `namingStyle` ("cityAndName" | "nameOnly")
- `relegation` (boolean), `promotedCount`, `demotedCount` (independent, each 0 to size; with relegation on, promoted + demoted is at least 1)
- `leagueAboveId?`, `leagueBelowId?` (links; counts and namingStyle must match across a link; at most one above and one below)
- `divisions` reserved for later (not in v1)

### Franchise

- `id`; persistent, never owned by a league
- `initialGrade` (A-F); grade for generation only
- has many FranchiseIdentity, TeamSeason

### FranchiseIdentity

- `franchiseId`, `fromSeason`
- `city`, `name`, `primaryColor`, `secondaryColor`
- Identity for a season is the latest record with `fromSeason` <= that season. Edited in the offseason, effective next season. In nameOnly leagues `name` is the full display name.

### Season

- `id`, `leagueId`, `year`/`index`, `status` (setup | active | offseason | archived)

### TeamSeason

- `seasonId`, `franchiseId`
- `finishingPosition?` (entered manually)
- roster = Player ids for that season (archived snapshot at season end)

### Player

- `id`, `name` (last name only), `age`, `kind` ("standard" | "goalie")
- standard: `offense`, `defense`, `sportsmanship`, `controlStars` (0-2)
- goalie: `goaltending` (31-46, base-6 digits 1-6), `sportsmanship`
- `status` ("active" | "retired"), `retiredSeason?`, `retiredFromFranchiseId?`
- Retired players are kept. Honors and career totals are reserved for later.
- Per-season rating snapshots are stored in the season archive.

### NameRegistry

- `burnedNames` (set); permanent
- Names burn on league accept and offseason accept (drafted players and new teams). Rerolled-away and undrafted names are not burned.
- The name list file (10k+, likely 40-50k) is loaded as data.

### Rules reference

- 2d6 initial age = 18 + roll (20-30). Draftee ages 18-22 by chart.
- SP by 2d6: 2-3=1, 4-5=2, 6-8=3, 9-10=4, 11-12=5.
- Goaltending ratings run 31-36 then 41-46: +1 from 36 is 41, -1 from 41 is 36. Creation minimum 31, retire at 26, max 46.
- Team names are unique within a league and across linked leagues; city names may repeat.
- Team control stars total 2-6: below 2, add one star at a time to the best position players; above 6, remove one at a time from the worst with stars; a player holds 0-2. Checked at generation and after progression (feature 18).
- Standard player OF+DE total max 8; promoted-team players cap OF/DE at 5 each, and if both rising would exceed 8 only the lower rises (4/3 becomes 4/4).
- Retirement tie-break: goalie before position player; position players by lowest OF+DE, then SP, then random; goalies by lowest GO, then SP, then random. A goalie at or below 26 retires.
- Chart tables are transcribed from `futti-program-specs.txt` at feature time and tested exactly.

## Tech stack

- **Expo SDK 57 / React Native / Expo Router** - tablet-first app, typed routes, strict TypeScript
- **Expo web build** - Windows and Mac via browser (optional PWA); no native desktop
- **Local-first storage** - native persistence and IndexedDB on web behind one storage layer; no backend
- **Export/import file** - data portability and backup
- **Pure rule functions** - injectable RNG for dice, charts, aging, progression
- **Unit tests (likely jest-expo)** - exact tests for every chart and rule; UI verified by hand and in the browser

## Monetization

None. Personal use.

## UI/UX

- Tablet-first, landscape-friendly, works in portrait; master-detail (team list beside roster); large touch targets
- Team colors drive headers, badges and rosters
- Player cards like the paper ones: OF/DE/SP numbers, CO as stars; goalies show GO and SP
- Light/dark follow system
- Dice results shown next to each outcome in generation and reroll screens
- Rerolls at player, team and league level; no per-value rerolls; only the name is hand-editable (rerolls also reroll names)
- The offseason is a wizard: one screen per step with Back and Next, never one busy screen; league detail shows only status and a Continue offseason button
- Offseason manual steps are "team X is on the clock" screens
- Main areas (routes to be finalized per feature): leagues, league detail with teams and rosters, season/finishing order, offseason wizard, franchise and player history, export/import

## Deployment

Personal distribution: Expo dev builds / TestFlight (iPad), APK (Android), static web export (`output: static`) on a free static host. No env vars, database, workers, or health path.

> TODO: choose the web host when the web build is ready.

## Open questions

- Importing a file merges name registries (assumed, not confirmed).
- Chains of 3+ linked leagues: model allows, UI optional in v1.
- Identity edit timing: offseason edit effective next season (assumed).
- Spec details to confirm while transcribing charts: promoted/demoted wording in milestone 1; the goalie chart labelled "sportsmanship" is the goaltending rating; progression cap and flip-rule interactions.
- Printable cards: layout, samples and backgrounds to be provided.
