# Build Plan

Fütti League and Game Tracker. Features in rough build order; details come in
`/feature`. Do not renumber completed items.

## Foundation
- [x] 1. **App shell and local storage** - Tablet-first navigation and master-detail layout, light/dark theme, persistent local storage on native and web, schema versioning, and unit test runner setup
- [x] 2. **Rating and dice engine** - Pure, fully unit-tested functions for 2d6/d6 rolls, ages, OF/DE totals and splits, control stars, sportsmanship, and goaltending base-6 arithmetic

## League and rosters
- [x] 3. **League management** - Create, edit and delete leagues (size, naming style, relegation settings), with delete confirmation and a model ready for divisions
- [x] 4. **Teams and franchises** - Teams with city, name, color-picker colors and initial grade, modeled as franchises with per-season identity so history stays accurate
- [x] 5. **Linked leagues** - Link a league above and below with enforced matching promoted/demoted counts and matching naming style
- [x] 6. **Initial roster generation** - Generate 6 players and 2 goaltenders per team from the charts, with dice results shown, and rerolls per player, team and whole league
- [x] 7. **Accept league** - Review all rosters, accept them, and lock rerolls so the values become the first season

## Names
- [x] 8a. **Name list and registry** - Normalize and de-duplicate the provided name list into app data, pick random last names that skip unavailable ones, and keep the permanent burned-name registry
- [x] 8b. **Name override and burning** - Manual name override with duplicate checks, and permanent burning on accept (build after 6 and 7)

## Output
- [x] 15. **Printable game cards** - Printable per-season player cards using the provided samples and backgrounds
- [x] 16. **Save game cards as PDF** - Save the printable cards to a PDF file on iOS and Android (share sheet / Save to Files), reusing the card sheets from 15; web keeps using the print dialog

## Seasons
- [x] 10. **Season archive and finishing order** - Record each season, enter the final finishing order by hand, and archive rosters and identities as a historical snapshot

## Offseason
- [x] 11a. **Offseason plan and rating rules** - Staged offseason plan per season (not applied until approval), pure promotion/demotion rating adjustments and replacement grade rolls, and choosing departing teams from the finishing order
- [x] 11b. **Offseason: move teams between linked leagues** - Departing teams go to the linked league above or below and that league's departing teams arrive here, with rating adjustments and control-star rerolls staged in the plan
- [x] 11c. **Offseason: new teams** - Fill remaining vacancies with newly created teams (identity, grade roll, generated roster), staged in the plan
- [x] 12a. **Offseason: protection, aging and release** - Protect one player per team, age players, retire the oldest unprotected, and randomly release one player per team into the free agency pool, all staged in the plan
- [x] 17. **Offseason wizard** - Replace the Offseason card with a step-by-step wizard, one screen per step with Back and Next: finishing order and departures, arrivals, new teams, protection, aging and release. League detail shows only a short status and a Continue offseason button; progress comes from the saved plan so it can be resumed
- [x] 12b. **Offseason: free agency draft** - Run the free agency draft from the released pool, best finisher first, staged in the plan
- [x] 13a. **Offseason: draft pool and rookie draft** - Generate the draft pool from total roster need (plus two extra position players and one extra goaltender), run the rookie draft in reverse finishing order, staged in the plan
- [x] 13b. **Offseason: progression** - Roll progression for eligible players, retire those who fall out, and fill the gaps with new random draftees, staged in the plan
- [x] 13c. **Offseason: approval and next season** - Approve the offseason: apply every staged change, create the next season, burn names, discard undrafted players, and open the offseason to leagues without relegation
- [x] 18. **Team control star limits** - Keep each team's total control stars between 2 and 6: when a team is generated, and again after progression in the offseason
- [ ] 11d. **Offseason: former teams** - Fill a vacancy with an unassigned team that once played in the league, with rating adjustment by direction; built after 13 defines the unassigned-team pool (teams that leave with no linked league stay as franchises with no league)

## History and output
- [ ] 14. **Franchise and player history** - Browse franchise history by season (identity changes included) and retired player records, with room for honors later

## Data portability
- [ ] 9. **Export and import** - Export all data to a file and import it on another device, merging the name registry. Built last.

## Later (not in the MVP)
Scheduling, scoring tabletop games, standings, player and goaltender stats,
divisions and conferences, player legacy honors and career totals.
