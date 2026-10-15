import type { League } from '@/leagues/league';
import type { Roster, RosterPlayer } from '@/rosters/roster';
import { GOALTENDERS, STANDARD_PLAYERS } from '@/rosters/roster';
import { identityForSeason, type Franchise, type FranchiseIdentity } from '@/teams/franchise';
import { pillTextScale, PILL_FONT_PT } from './pill-text';
import { cardColors, type CardColors } from './card-colors';
import {
  BACKGROUND_OPACITY,
  CARD_HEIGHT_IN,
  CARD_WIDTH_IN,
  SHEET_HEIGHT_IN,
  SHEET_MARGIN_IN,
  SHEET_WIDTH_IN,
  backgroundFor,
  paginate,
  type BackgroundImage,
} from './card-layout';

export interface CardSheetsInput {
  league: League;
  seasonIndex: number;
  /** In the order the teams are printed, one row each. */
  franchises: Franchise[];
  rosters: Roster[];
  /** A `data:image/...` URI for each background. */
  images: Record<BackgroundImage, string>;
  /** A `data:font/ttf;base64,...` URI for the Open Sans variable font. */
  font: string;
  /** A `data:font/ttf;base64,...` URI for Rockwell Nova Condensed Bold. */
  pillFont: string;
}

export type CardSheetsResult =
  | { ok: true; html: string; pages: number }
  | { ok: false; reason: 'no-teams' | 'missing-data' | 'invalid-roster' | 'invalid-image'; message: string };

const HEX = /^#[0-9a-f]{6}$/i;
const IMAGE_URI = /^data:image\/[a-z+.-]+;base64,[a-z0-9+/=]+$/i;
const FONT_URI = /^data:font\/ttf;base64,[a-z0-9+/=]+$/i;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Pill text in capitals, compressed horizontally when it would not fit at the pill font size. */
function pillText(value: string): string {
  const upper = value.toUpperCase();
  const scale = pillTextScale(upper);
  const style = scale < 1 ? ` style="transform:scaleX(${scale})"` : '';
  return `<span${style}>${escapeHtml(upper)}</span>`;
}

/** The artwork fills the space between the pills, reaching a little under them; the pills are drawn over it. */
const PILL_EDGE_IN = 0.27;
const PILL_INSET_IN = 0.06;

/** Offense and defense values, in Open Sans Condensed ExtraBold. */
const NUMBER_PT = 40;
/** Stretches the digits taller without widening them. */
const NUMBER_STRETCH_Y = 1.1;
/** OFFENCE and DEFENCE labels, and the SPORTSMANSHIP label on standard cards. */
/** Goaltending value, in the same font as the offense and defense values. */
const GOALIE_RATING_PT = 48;
/** On goaltender cards the sportsmanship label moves down and its value up by this much, closing the gap between them. */
const GOALIE_SP_NUDGE_IN = 0.03;
/** Sportsmanship value on both kinds of card. */
const SP_VALUE_PT = 24;
const STAT_LABEL_PT = 14;
const SP_LABEL_PT = 10;
/** Moves the OFFENCE label and value down, away from the top pill. */
const OFFENCE_ROW_DROP_IN = 0.05;
const LABEL_GRAY = '#4d4d4d';
const FONT_FAMILY = 'Futti Card';
const PILL_FONT_FAMILY = 'Futti Pill';

const STYLE = `
@page { size: ${SHEET_WIDTH_IN}in ${SHEET_HEIGHT_IN}in; margin: ${SHEET_MARGIN_IN}in; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: "${FONT_FAMILY}", "Arial Narrow", Arial, sans-serif; font-weight: 700; color: #444; }
.sheet { width: ${SHEET_WIDTH_IN - 2 * SHEET_MARGIN_IN}in; height: ${SHEET_HEIGHT_IN - 2 * SHEET_MARGIN_IN}in; break-after: page; page-break-after: always; overflow: hidden; }
.sheet:last-child { break-after: auto; page-break-after: auto; }
.row { display: flex; height: ${CARD_HEIGHT_IN}in; }
.card { position: relative; width: ${CARD_WIDTH_IN}in; height: ${CARD_HEIGHT_IN}in; flex: none; border: 1px solid #bbb; overflow: hidden; }
.bg { position: absolute; top: ${PILL_EDGE_IN}in; left: ${PILL_INSET_IN}in; right: ${PILL_INSET_IN}in; bottom: ${PILL_EDGE_IN}in; opacity: ${BACKGROUND_OPACITY}; background-size: cover; background-position: center; background-repeat: no-repeat; }
.bg.mirrored { transform: scaleX(-1); }
.pill { position: absolute; left: 0.06in; right: 0.06in; height: 0.24in; border-radius: 0.12in; display: flex; align-items: center; justify-content: center; font-family: "${PILL_FONT_FAMILY}", Georgia, serif; font-weight: 700; font-stretch: 100%; font-size: ${PILL_FONT_PT}pt; white-space: nowrap; overflow: hidden; }
.pill > span { flex: none; line-height: 1; }
.top { top: 0.06in; }
.bottom { bottom: 0.06in; }
.body { position: absolute; top: 0.34in; bottom: 0.34in; left: 0.06in; right: 0.06in; display: flex; flex-direction: column; justify-content: center; }
.line { display: flex; align-items: baseline; justify-content: center; gap: 0.04in; white-space: nowrap; }
.stat-label { font-size: ${STAT_LABEL_PT}pt; color: ${LABEL_GRAY}; }
.sp-label { font-size: ${SP_LABEL_PT}pt; color: ${LABEL_GRAY}; }
.stat { align-items: center; }
.offence { position: relative; top: ${OFFENCE_ROW_DROP_IN}in; }
.num { display: inline-block; font-size: ${NUMBER_PT}pt; font-weight: 800; line-height: 0.8; transform: scaleY(${NUMBER_STRETCH_Y}); }
.sp-value { font-size: ${SP_VALUE_PT}pt; font-weight: 800; line-height: 0.8; }
.standard { top: 0.3in; bottom: 0.46in; justify-content: space-evenly; }
.stars { position: absolute; left: 0; right: 0; bottom: 0.34in; height: 0.18in; text-align: center; font-size: 14pt; line-height: 0.18in; }
.goalie { top: 0.3in; bottom: 0.3in; justify-content: space-evenly; align-items: center; text-align: center; }
.rating { font-size: ${GOALIE_RATING_PT}pt; }
.goalie .sp-label { position: relative; top: ${GOALIE_SP_NUDGE_IN}in; }
.goalie .sp-value { position: relative; top: -${GOALIE_SP_NUDGE_IN}in; }
`;

function fail(reason: Extract<CardSheetsResult, { ok: false }>['reason'], message: string): CardSheetsResult {
  return { ok: false, reason, message };
}

function validRoster(roster: Roster): boolean {
  return (
    roster.players.length === STANDARD_PLAYERS + GOALTENDERS &&
    roster.players.every((p, i) => p.kind === (i < STANDARD_PLAYERS ? 'standard' : 'goalie'))
  );
}

function card(
  player: RosterPlayer,
  position: number,
  teamLabel: string,
  colors: CardColors,
): string {
  const { image, mirrored } = backgroundFor(position);
  const pill = `color:${colors.pillText}`;
  const top = `<div class="pill top" style="background:${colors.topFill};${pill}">${pillText(player.name)}</div>`;
  const bottom = `<div class="pill bottom" style="background:${colors.bottomFill};${pill}">${pillText(teamLabel)}</div>`;
  const bg = `<div class="bg bg-${image}${mirrored ? ' mirrored' : ''}"></div>`;

  if (player.kind === 'goalie') {
    const body = `<div class="body goalie"><div class="stat-label">GOALTENDING</div><div class="num rating" style="color:${colors.number}">${player.goaltending}</div><div class="sp-label">SPORTSMANSHIP</div><div class="sp-value" style="color:${colors.sportsmanship.goalie}">${player.sportsmanship}</div></div>`;
    return `<div class="card goalie-card">${bg}${top}${body}${bottom}</div>`;
  }
  const num = (n: number) => `<span class="num" style="color:${colors.number}">${n}</span>`;
  const body = `<div class="body standard"><div class="line stat offence"><span class="stat-label">OFFENCE:</span>${num(player.offense)}</div><div class="line"><span class="sp-value" style="color:${colors.sportsmanship.standard}">${player.sportsmanship}</span><span class="sp-label">SPORTSMANSHIP</span></div><div class="line stat"><span class="stat-label">DEFENCE:</span>${num(player.defense)}</div></div>`;
  const stars = `<div class="stars" style="color:${colors.stars}">${'★'.repeat(player.controlStars)}</div>`;
  return `<div class="card">${bg}${top}${body}${stars}${bottom}</div>`;
}

/**
 * The printable HTML for one season's cards: US Letter landscape sheets of four team rows, each row six
 * standard players then two goaltenders. Builds nothing when any team's data is missing or malformed.
 */
export function buildCardSheets(input: CardSheetsInput): CardSheetsResult {
  const { league, seasonIndex, franchises, rosters, images, font, pillFont } = input;
  if (franchises.length === 0) return fail('no-teams', 'This league has no teams to print.');

  for (const uri of Object.values(images)) {
    if (!IMAGE_URI.test(uri)) return fail('invalid-image', 'A card background image could not be used.');
  }
  if (!FONT_URI.test(pillFont)) return fail('invalid-image', 'The pill font could not be used.');
  if (!FONT_URI.test(font)) return fail('invalid-image', 'The card font could not be used.');

  const rosterByTeam = new Map(rosters.map((r) => [r.franchiseId, r]));
  const rows: string[] = [];
  for (const team of franchises) {
    const identity: FranchiseIdentity | null = identityForSeason(team, seasonIndex);
    if (identity === null) return fail('missing-data', 'A team has no identity for this season.');
    if (!HEX.test(identity.primaryColor) || !HEX.test(identity.secondaryColor)) {
      return fail('missing-data', `${identity.name} has a team color that cannot be printed.`);
    }
    const roster = rosterByTeam.get(team.id);
    if (roster === undefined) return fail('missing-data', `${identity.name} has no roster.`);
    if (!validRoster(roster)) {
      return fail('invalid-roster', `${identity.name} needs ${STANDARD_PLAYERS} players and ${GOALTENDERS} goaltenders.`);
    }
    const label = league.namingStyle === 'cityAndName' ? identity.city : identity.name;
    const colors = cardColors(identity.primaryColor.toLowerCase(), identity.secondaryColor.toLowerCase());
    const cards = roster.players.map((p, i) => card(p, i, label, colors)).join('');
    rows.push(`<div class="row">${cards}</div>`);
  }

  const sheets = paginate(rows.length).map(
    (indexes) => `<section class="sheet">${indexes.map((i) => rows[i]).join('')}</section>`,
  );
  const backgrounds = (Object.keys(images) as BackgroundImage[])
    .map((key) => `.bg-${key} { background-image: url("${images[key]}"); }`)
    .join('\n');

  const pillFace = `@font-face { font-family: "${PILL_FONT_FAMILY}"; src: url("${pillFont}") format("truetype"); font-weight: 700; }\n`;
  const fontFace = `@font-face { font-family: "${FONT_FAMILY}"; src: url("${font}") format("truetype"); font-weight: 300 800; font-stretch: 75% 100%; }\nbody, .card { font-stretch: 75%; }\n`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(league.name)} cards</title><style>${pillFace}${fontFace}${STYLE}${backgrounds}</style></head><body>${sheets.join('')}</body></html>`;
  return { ok: true, html, pages: sheets.length };
}
