# Project Plan

## 1. Problem - What problem are we solving?

Fütti ("footy") is a made-up sport closely modeled on futsal. Teams field five
players (a goalkeeper, two attackers, two defenders) plus substitutes. A match
is forty minutes in two halves, the clock stops for fouls, injuries, goals and
out-of-bounds balls, and there is no stoppage time. Fouls escalate from a
warning, to a yellow card (sidelined until the next major stoppage), to a red
card (removed for the game, with a penalty kick for the opponent). A game can
end early if one team builds a big enough late lead. Because the sport is
fictional, there are no real leagues, teams or stars. The fun is inventing your
own.

Fütti is also a tabletop game. One person plays a full match with dice and
paper player cards. Each card rates a player on offense, defense and
sportsmanship (a "temper" rating), with control stars and a goaltending rating
for keepers. Doing the bookkeeping for a whole league by hand (generating
rosters from dice charts, running a promotion and relegation offseason with
aging, retirement, free agency, drafts and progression) is slow and error-prone.

This app is the commissioner's tool. It creates leagues, generates rosters
exactly as the dice charts specify, runs the offseason, and preserves the full
history of players, teams and seasons.

The app NEVER simulates a match. Games are always played on the tabletop. A
later phase lets the commissioner score games rolled at the table.

## 2. Users - Who is this for?

A single commissioner who runs one or more Fütti leagues, and possibly a small
circle of friends who play the tabletop game. One commissioner makes every
decision and every draft pick for every team. There are no per-team owners, no
private views and no accounts.

## 3. Features - What does the MVP need?

MVP (see build-plan.md for order):
- League creation and management (6 to 20 teams in steps of 2), relegation or
  non-relegation, linked leagues with enforced matching counts
- Teams with city, name, two colors (color picker) and an initial grade A to F
- Dice-chart roster generation with rerolls at player, team and league level,
  then an accept step that locks the values
- Name generator backed by a provided name list (10,000+, likely 40-50k) with a
  permanent no-duplicate registry
- Export and import of a file to move data between devices
- Season finishing-order entry and season archive
- Full offseason: promotion and relegation, team sourcing, protection, aging and
  retirement, free agency, rookie draft, progression, commissioner approval
- Franchise history and retired player records
- Printable player cards (samples and backgrounds to be provided at that step)

Later, not MVP (the data model must leave room):
- Scheduling a season
- Scoring games rolled on the tabletop
- Standings and player/goaltender stats
- Divisions and conferences
- Player legacy: honors (Hall of Fame, awards, retired jerseys, championships)
  and automatically computed career totals

Explicit non-goals: simulating matches, accounts or cloud sync, multi-user
access, free-text player biographies, store releases, monetization.

## 4. Data - What are we storing?

- League: size, naming style (city plus name, or name only), relegation flag,
  promoted count, demoted count, links to the league above and below
- Franchise (a team that persists across leagues and seasons, never owned by a
  league)
- Franchise identity record per season: city, name, primary color, secondary
  color (so history shows how a team looked at the time)
- Team season membership: which league a franchise played in each season,
  its final finishing position (entered manually), and its grade
- Player: standard (name, age, OF, DE, SP, control stars 0-2) and goaltender
  (name, age, GO, SP). Last names only.
- Roster per team per season: 6 standard players and 2 goaltenders
- Retired players: kept as records (final ratings, team, retirement season).
  Schema leaves room for honors and career totals later.
- Season archive: snapshot of rosters, ratings, identities and finishing order
- Name registry: every burned name, permanently
- Undrafted draftees are deleted immediately and their names return to the pool

Names are burned when a league is accepted and when an offseason is accepted
(for drafted players and new teams). Rerolled-away and undrafted names are not
burned. Hand-typed names are checked against the burned list and the rest of
the roster. Importing a file merges name registries (assumption, see TODOs).

## 5. Tech - What stack are we using?

- React Native with Expo (SDK 57), Expo Router, strict TypeScript
- Targets: iPad and Android tablets first. Windows and Mac use the Expo web
  build in a browser (optionally installed as a PWA). No native desktop apps.
- Local-first storage, no backend. Storage works on native and in the browser
  (IndexedDB on web), behind one storage layer.
- Export and import of a single file to move data or back it up. On desktop
  this is also the backup.
- Rule logic (dice, charts, goaltending base-6 arithmetic, caps, aging,
  progression, offseason ordering) lives in pure functions with injectable
  random numbers.
- Unit testing from the start with a stack-native runner (likely jest-expo).
  Every chart and rule gets exact tests. UI is verified by hand and in the
  browser.

Goaltending rating arithmetic: ratings are two-digit values where each digit is
1-6 (31 to 46). Adding 1 to 36 gives 41, and subtracting 1 from 41 gives 36.
Retirement triggers at 26 (progression), and the creation minimum is 31.

## 6. Monetize - How will this make money?

It won't. Personal use by the commissioner and friends, distributed through
development builds, TestFlight, an Android APK and a free-hosted web build. No
store listings.

## 7. UI/UX - How should this look and feel?

- Tablet-first, landscape-friendly, and it must still work in portrait
- Master-detail screens (team list beside roster), with large touch targets
- Team colors drive headers, badges and roster views
- Players appear as small cards like the paper ones: OF, DE, SP as numbers,
  control (CO) as star icons; goalies show GO and SP
- Light and dark follow the system setting
- Generation and reroll screens show the actual dice results next to each
  outcome, so it feels like the tabletop game
- Rerolls are offered per player, per team and for the whole league. There are
  no per-value rerolls. The only hand-editable field is a player name. A
  player or league reroll also rerolls names.
- The offseason is a wizard: one screen per step (finishing order and
  departures, arrivals, new teams, protection, aging and release, free agency
  draft, rookie draft, approval) with Back and Next, never one busy screen. League
  detail only shows its status and a Continue offseason button.
- Offseason manual steps (protection, free agency draft, rookie draft) are
  step-by-step "team X is on the clock" screens for one commissioner

## 8. Deployment - Where and how will this ship?

Personal distribution only. Expo development builds and TestFlight for iPad,
APK for Android, and a static web export (`output: static` is already set)
hosted on a free static host for Windows and Mac. No env vars, database,
workers or health checks. Hosting choice is a TODO for when the web build is
ready.

## 9. Usage model and constraints (optional)

- Single user, local data, trusted environment. No security or compliance
  requirements beyond not losing the user's data.
- Data loss prevention matters: export/import, a confirmation before deleting a
  league, and a locked accepted state after generation.
- Scale: up to 20 teams per league, a few leagues linked, many seasons of
  history.
- Explicit non-requirements: multi-user, accounts, sync, simulation.

## League rules (confirmed from the spec)

### Setup
- Sizes: 6, 8, 10, 12, 14, 16, 18, 20 teams
- Relegation or non-relegation. A relegation league must move at least one team
  each season (promoted plus demoted is at least 1; each is at most the league
  size). In relegation leagues, promoted and demoted
  counts are separate values (a senior league may demote 2 and promote 0, a
  junior league may promote 2 and demote 0).
- Leagues can be linked. A league sends relegated teams to the league below and
  receives promoted teams from it. Counts must match across a link, and the
  naming style must match across linked leagues. The data model allows chains,
  one league above and one below at most (assumption, first version needs only
  a pair).
- Naming style is a league setting: "city and name" (Richmond Greyhounds) or
  "name only" (AFC Richmond, Manchester City). Every team always stores both a
  city and a name. In name-only leagues the name is the full display name.
- Leagues can be added, edited and deleted. Deleting requires confirmation.
- Divisions and conferences are not in v1, but the model must support them
  later.

### Teams
- City, name, primary color, secondary color (color picker), initial grade
  A, B, C, D or F
- Team names are unique within a league, and across both leagues when two
  leagues are linked. City names may repeat (Manchester City and Manchester
  United are both in Manchester).
- Teams are mobile. They have a seasonal, not permanent, relationship with a
  league. They keep their identity when they move leagues.
- Identity (city, name, colors) may change in a future season. The commissioner
  edits it in the offseason and it takes effect the next season. Earlier
  seasons keep the old identity (assumption on timing, see TODOs).

### Roster and generation
- 6 standard players and 2 goaltenders per team
- Standard player: name (last name only), age, OF, DE, SP, CO (0-2 stars shown
  as stars)
- Goaltender: name, age, GO, SP
- Ages for initial players by 2d6: 2=20, 3=21, ... 12=30 (age = 18 + roll)
- Total offense plus defense by 2d6 per grade (chart in the spec)
- The total is split into OF and DE by a d6 table per total (2 to 8)
- Control stars by 2d6 per total (2 to 8)
- Sportsmanship by 2d6: 2-3 = 1, 4-5 = 2, 6-8 = 3, 9-10 = 4, 11-12 = 5
- Goaltending rating by 2d6 per grade (chart in the spec)
- The commissioner can reroll until satisfied, then accept. Accepting locks
  rerolls and sets the first season.

Detailed chart values are transcribed from the provided spec file
(`futti-program-specs.txt`) at feature time and covered by exact unit tests.

### Offseason (in order)
1. Promotion and relegation: choose departing teams, bring in replacements. A
   replacement can be a new team, a team from another league, or a former member
   of this league.
2. New teams: commissioner sets city, name and colors. Initial grade by d6:
   replacing a demoted team: 1 = C, 2-3 = D, 4-6 = F. Replacing a promoted
   team: 1 = A, 2-3 = B, 4-6 = C. New teams get a fresh roster from the creation
   charts and skip the draft, free agency, aging and progression.
3. Existing teams brought in: replacing a demoted team: OF and DE each drop 1
   (minimum 1), controls regenerated, goaltenders drop 2 (minimum 31).
   Replacing a promoted team: OF and DE each rise 1 (max 5 each, total max 8;
   if both rising would exceed a total of 8, only the lower value rises, so
   4 and 3 becomes 4 and 4), controls regenerated, goaltenders rise 2 (max 46). These teams take part in
   aging, free agency, the draft and progression.
4. Protection: the commissioner protects one player per team (cannot age out or
   be lost to free agency).
5. Aging: everyone (except new-team players) gains a year. The oldest
   unprotected player per team retires. Ties: a goaltender goes before a
   position player. Among position players the lowest OF + DE total retires,
   then the lowest sportsmanship, then a random choice. Among goaltenders the
   lowest goaltending rating retires, then the lowest sportsmanship, then a
   random choice.
6. Each team randomly loses one player to the free agent pool.
7. Free agency draft (manual): best previous finisher picks first. A team may
   re-draft the player it just lost.
8. Draft pool: for each team missing a position player or goaltender, create a
   draftee, plus two extra position players and one extra goaltender. Draftees
   use the draft charts (ages 18-22, total OF plus DE chart, GO 31-45 chart,
   the standard SP and control charts).
9. Rookie draft (manual): reverse order of last season's finish. Undrafted
   draftees are deleted and their names reclaimed.
10. Progression for non-new, non-retired, non-drafted players, per the age band
    rules for standard players (23 and under, 24 to 29, 30 and over) and for
    goaltenders. Totals cap at 8, goaltending caps at 46. A standard player
    whose total drops to 1 retires and the team gets a random drafted player.
    A goaltender at 26 retires and the team gets a random drafted goaltender.
    OF and DE are recalculated from the new total, flipping if the original
    player was offense- or defense-leaning and the recalculation inverts it.
    Control stars are regenerated.
11. The commissioner approves and the league is marked ready for the next
    season. Drafted players' and new teams' names are burned at this point.

The final finishing order used by the offseason is entered manually in v1
(ties are resolved by the commissioner's ordering). Standings will pre-fill it
later.

## Open items / TODOs

- Chart values: confirm any ambiguous spec details while transcribing
  (the promoted/demoted wording in milestone 1, and the goalie chart label
  that says "sportsmanship" but is the goaltending rating)
- Import behavior: merge name registries (assumed, not confirmed)
- Chains of 3 or more linked leagues: model allows, UI optional in v1
- Identity edit timing: offseason edit effective next season (assumed)
- Web hosting provider for the static build
- Printable cards: layout, sample images and backgrounds to be provided
- Remaining progression details (flip rule) to confirm when feature 13 is
  specced. A goaltender at or below 26 retires (confirmed).
