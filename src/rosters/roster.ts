import { createId } from '@/leagues/ids';
import { normalizeName } from '@/names/normalize-name';
import { isValidGoaltending } from '@/rules/goaltending';
import type { Grade, Stars } from '@/rules/charts';
import type { Rng } from '@/rules/dice';
import { generateDraftGoaltender, generateDraftStandardPlayer, generateGoaltender, generateStandardPlayer } from '@/rules/player-generation';

export const ROSTER_COLLECTION = 'rosters';
export const STANDARD_PLAYERS = 6;
export const GOALTENDERS = 2;

export interface StandardRosterPlayer {
  id: string;
  kind: 'standard';
  name: string;
  age: number;
  offense: number;
  defense: number;
  sportsmanship: number;
  controlStars: Stars;
  /** The dice that produced each value; `split` is null when no roll was needed. */
  rolls: { age: number; total: number; split: number | null; stars: number; sportsmanship: number };
}

export interface GoalieRosterPlayer {
  id: string;
  kind: 'goalie';
  name: string;
  age: number;
  goaltending: number;
  sportsmanship: number;
  rolls: { age: number; goaltending: number; sportsmanship: number };
}

export type RosterPlayer = StandardRosterPlayer | GoalieRosterPlayer;

/** One document per team: 6 standard players followed by 2 goaltenders. */
export interface Roster {
  franchiseId: string;
  leagueId: string;
  players: RosterPlayer[];
}

/** Thrown by a `pickName` that has no available name left. */
export class NamesExhaustedError extends Error {
  constructor() {
    super('No unused last names are left');
    this.name = 'NamesExhaustedError';
  }
}

export type PickName = () => string;

function standardFrom(r: ReturnType<typeof generateStandardPlayer>, name: string, id: string): StandardRosterPlayer {
  return {
    id,
    kind: 'standard',
    name,
    age: r.age.value,
    offense: r.split.offense,
    defense: r.split.defense,
    sportsmanship: r.sportsmanship.value,
    controlStars: r.stars.value,
    rolls: {
      age: r.age.roll as number,
      total: r.total.roll as number,
      split: r.split.roll,
      stars: r.stars.roll as number,
      sportsmanship: r.sportsmanship.roll as number,
    },
  };
}

function goalieFrom(r: ReturnType<typeof generateGoaltender>, name: string, id: string): GoalieRosterPlayer {
  return {
    id,
    kind: 'goalie',
    name,
    age: r.age.value,
    goaltending: r.goaltending.value,
    sportsmanship: r.sportsmanship.value,
    rolls: {
      age: r.age.roll as number,
      goaltending: r.goaltending.roll as number,
      sportsmanship: r.sportsmanship.roll as number,
    },
  };
}

export function generateStandard(grade: Grade, rng: Rng, pickName: PickName, newId: () => string = createId): StandardRosterPlayer {
  const name = pickName();
  return standardFrom(generateStandardPlayer(grade, rng), name, newId());
}

export function generateGoalie(grade: Grade, rng: Rng, pickName: PickName, newId: () => string = createId): GoalieRosterPlayer {
  const name = pickName();
  return goalieFrom(generateGoaltender(grade, rng), name, newId());
}

/** A draftee: age 18-22 and ratings from the draft charts. */
export function generateDraftStandard(rng: Rng, pickName: PickName, newId: () => string = createId): StandardRosterPlayer {
  const name = pickName();
  return standardFrom(generateDraftStandardPlayer(rng), name, newId());
}

export function generateDraftGoalie(rng: Rng, pickName: PickName, newId: () => string = createId): GoalieRosterPlayer {
  const name = pickName();
  return goalieFrom(generateDraftGoaltender(rng), name, newId());
}

export function generateRoster(
  franchiseId: string,
  leagueId: string,
  grade: Grade,
  rng: Rng,
  pickName: PickName,
  newId: () => string = createId,
): Roster {
  const players: RosterPlayer[] = [];
  for (let i = 0; i < STANDARD_PLAYERS; i += 1) players.push(generateStandard(grade, rng, pickName, newId));
  for (let i = 0; i < GOALTENDERS; i += 1) players.push(generateGoalie(grade, rng, pickName, newId));
  return { franchiseId, leagueId, players };
}

/** Replaces one player in place with a fresh one of the same kind; null when the id is not on the roster. */
export function rerollPlayer(
  roster: Roster,
  playerId: string,
  grade: Grade,
  rng: Rng,
  pickName: PickName,
  newId: () => string = createId,
): Roster | null {
  const index = roster.players.findIndex((p) => p.id === playerId);
  if (index < 0) return null;
  const old = roster.players[index];
  const fresh =
    old.kind === 'standard'
      ? generateStandard(grade, rng, pickName, newId)
      : generateGoalie(grade, rng, pickName, newId);
  const players = roster.players.slice();
  players[index] = fresh;
  return { ...roster, players };
}

/** Longest typed last name; the longest provided name is 16. */
export const NAME_MAX_LENGTH = 40;

export type RenameError = { kind: 'invalid-name' | 'name-taken' | 'not-found' };

/**
 * Gives one player a typed last name, normalized like every stored name. `unavailable` holds every name
 * that may not be used (burned names and other players' names); the player's own current name is always allowed.
 */
export function renamePlayer(
  roster: Roster,
  playerId: string,
  rawName: string,
  unavailable: ReadonlySet<string>,
): { ok: true; value: Roster } | { ok: false; error: RenameError } {
  const index = roster.players.findIndex((p) => p.id === playerId);
  if (index < 0) return { ok: false, error: { kind: 'not-found' } };
  const name = normalizeName(rawName);
  if (name === null || name.length > NAME_MAX_LENGTH) return { ok: false, error: { kind: 'invalid-name' } };
  const old = roster.players[index];
  if (name !== old.name && unavailable.has(name)) return { ok: false, error: { kind: 'name-taken' } };
  const players = roster.players.slice();
  players[index] = { ...old, name };
  return { ok: true, value: { ...roster, players } };
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isRoll(value: unknown, min: number, max: number): boolean {
  return isInt(value, min, max);
}

function isPlayer(value: unknown, kind: 'standard' | 'goalie', minAge = 20, maxAge = 30): value is RosterPlayer {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  if (p.kind !== kind) return false;
  if (typeof p.id !== 'string' || p.id.length === 0) return false;
  if (typeof p.name !== 'string' || normalizeName(p.name) !== p.name) return false;
  if (!isInt(p.age, minAge, maxAge) || !isInt(p.sportsmanship, 1, 5)) return false;
  const rolls = p.rolls as Record<string, unknown> | null;
  if (typeof rolls !== 'object' || rolls === null) return false;
  if (!isRoll(rolls.age, 2, 12) || !isRoll(rolls.sportsmanship, 2, 12)) return false;
  if (kind === 'goalie') {
    return typeof p.goaltending === 'number' && isValidGoaltending(p.goaltending) && isRoll(rolls.goaltending, 2, 12);
  }
  return (
    isInt(p.offense, 1, 7) &&
    isInt(p.defense, 1, 7) &&
    (p.offense as number) + (p.defense as number) <= 8 &&
    isInt(p.controlStars, 0, 2) &&
    isRoll(rolls.total, 2, 12) &&
    (rolls.split === null || isRoll(rolls.split, 1, 6)) &&
    isRoll(rolls.stars, 2, 12)
  );
}

/** A drafted player as staged in an offseason plan: either kind, age 18-22, otherwise a valid roster player. */
export function isDraftee(value: unknown): value is RosterPlayer {
  const kind = (value as { kind?: unknown } | null)?.kind;
  return (kind === 'standard' || kind === 'goalie') && isPlayer(value, kind, 18, 22);
}

export function isRoster(value: unknown): value is Roster {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.franchiseId !== 'string' || v.franchiseId.length === 0) return false;
  if (typeof v.leagueId !== 'string' || v.leagueId.length === 0) return false;
  const players = v.players;
  if (!Array.isArray(players) || players.length !== STANDARD_PLAYERS + GOALTENDERS) return false;
  const ok = players.every((p, i) => isPlayer(p, i < STANDARD_PLAYERS ? 'standard' : 'goalie'));
  if (!ok) return false;
  return new Set(players.map((p) => (p as RosterPlayer).id)).size === players.length;
}
