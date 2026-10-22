import type { League } from '@/leagues/league';
import { isDraftee, isPlayerAged, isRoster, type RosterPlayer } from '@/rosters/roster';
import type { Grade } from '@/rules/charts';
import type { SeasonArchive } from '@/seasons/season-archive';
import { validateIdentityInput } from '@/teams/franchise';
import { replacementGrade } from './rating-adjust';

export const OFFSEASON_PLAN_COLLECTION = 'offseason-plans';

/** A team coming from a linked league, with the roster as adjusted for this league. Staged only; live data is unchanged. */
export interface StagedArrival {
  franchiseId: string;
  fromLeagueId: string;
  /** The season of the other league whose plan named this team. */
  sourceSeasonId: string;
  /** `promoted` arrives from the league below, `demoted` from the league above. */
  movement: 'promoted' | 'demoted';
  players: RosterPlayer[];
}

/** A newly created team staged to fill a place the linked leagues do not fill. Live data is unchanged until the offseason is approved. */
export interface StagedNewTeam {
  /** The franchise id the team will get when the offseason is applied. */
  id: string;
  /** The movement of the departing team whose place it fills; it decides the grade roll. */
  vacancy: 'promoted' | 'demoted';
  /** The d6 that chose `grade`. */
  gradeRoll: number;
  grade: Grade;
  city: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  players: RosterPlayer[];
}

/** What happens to one participating team's players. `retiredId` and `releasedId` are set together once aging has run. */
export interface StagedTeamChange {
  franchiseId: string;
  protectedId: string;
  /** The oldest unprotected player, who leaves the league. */
  retiredId?: string;
  /** An unprotected, non-retired player chosen at random for the free agency pool. */
  releasedId?: string;
}

/** One free agency pick: `playerId` is a released player, taken by `franchiseId`. */
export interface StagedFreeAgentPick {
  franchiseId: string;
  playerId: string;
}

/** One rookie draft pick: `playerId` is a draftee in `draftPool`, taken by `franchiseId`. */
export interface StagedDraftPick {
  franchiseId: string;
  playerId: string;
}

/**
 * What happens to one progressing player. `after` holds the changed ratings (the stored age is unchanged);
 * `replacement` is set instead when the player retires, and is a new draftee for the same team.
 */
export interface StagedProgression {
  /** The team the player is on after the drafts. */
  franchiseId: string;
  playerId: string;
  /** The d6 that decided the change. */
  roll: number;
  after?: RosterPlayer;
  replacement?: RosterPlayer;
}

/** The teams leaving the league this offseason, by franchise id, and the teams staged to arrive or to be created. One document per season; its id is the season id. */
export interface OffseasonPlan {
  seasonId: string;
  leagueId: string;
  promoted: string[];
  demoted: string[];
  arrivals?: StagedArrival[];
  newTeams?: StagedNewTeam[];
  teamChanges?: StagedTeamChange[];
  /** Free agency picks in the order they were made. */
  freeAgentPicks?: StagedFreeAgentPick[];
  /** Generated draftees (age 18-22); the ones nobody picks are destroyed at approval. */
  draftPool?: RosterPlayer[];
  /** Rookie draft picks in the order they were made; a team may appear several times. */
  draftPicks?: StagedDraftPick[];
  /** Progression results, one per progressing player in roll order. */
  progression?: StagedProgression[];
}

/** The names of every player staged in a plan: new teams, the draft pool and progression replacements. */
export function stagedPlayerNames(plan: OffseasonPlan): string[] {
  return [
    ...(plan.newTeams ?? []).flatMap((t) => t.players.map((p) => p.name)),
    ...(plan.draftPool ?? []).map((p) => p.name),
    ...(plan.progression ?? []).flatMap((r) => (r.replacement === undefined ? [] : [r.replacement.name])),
  ];
}

export type DepartureError =
  | 'promoted-count'
  | 'demoted-count'
  | 'unknown-team'
  | 'overlap'
  | 'too-few-teams';

export type DepartureValidation = { ok: true } | { ok: false; error: DepartureError };

/** The best `promotedCount` finishers go up and the worst `demotedCount` go down. */
export function suggestDepartures(archive: SeasonArchive, league: League): { promoted: string[]; demoted: string[] } {
  const ids = [...archive.teams].sort((a, b) => a.position - b.position).map((t) => t.franchiseId);
  const promoted = ids.slice(0, league.promotedCount);
  const demoted = league.demotedCount === 0 ? [] : ids.slice(-league.demotedCount);
  return { promoted, demoted };
}

export function validateDepartures(input: {
  archive: SeasonArchive;
  league: League;
  promoted: string[];
  demoted: string[];
}): DepartureValidation {
  const { archive, league, promoted, demoted } = input;
  const bad = (error: DepartureError): DepartureValidation => ({ ok: false, error });
  if (promoted.length !== league.promotedCount) return bad('promoted-count');
  if (demoted.length !== league.demotedCount) return bad('demoted-count');
  if (promoted.length + demoted.length > archive.teams.length) return bad('too-few-teams');
  const known = new Set(archive.teams.map((t) => t.franchiseId));
  const all = [...promoted, ...demoted];
  if (!all.every((id) => known.has(id))) return bad('unknown-team');
  if (new Set(all).size !== all.length) return bad('overlap');
  return { ok: true };
}

export function departureErrorText(error: DepartureError, league: League): string {
  switch (error) {
    case 'promoted-count':
      return `Choose exactly ${league.promotedCount} promoted ${league.promotedCount === 1 ? 'team' : 'teams'}.`;
    case 'demoted-count':
      return `Choose exactly ${league.demotedCount} demoted ${league.demotedCount === 1 ? 'team' : 'teams'}.`;
    case 'unknown-team':
      return 'A chosen team is not in this season.';
    case 'overlap':
      return 'A team cannot be both promoted and demoted.';
    case 'too-few-teams':
      return 'This league does not have enough teams for that many promotions and demotions.';
  }
}

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string' && id.length > 0);
}

function isStagedArrival(value: unknown): value is StagedArrival {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const named = (x: unknown) => typeof x === 'string' && x.length > 0;
  return (
    named(v.franchiseId) &&
    named(v.fromLeagueId) &&
    named(v.sourceSeasonId) &&
    (v.movement === 'promoted' || v.movement === 'demoted') &&
    isRoster({ franchiseId: v.franchiseId, leagueId: v.fromLeagueId, players: v.players })
  );
}

function isStagedNewTeam(value: unknown, leagueId: string): value is StagedNewTeam {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (v.vacancy !== 'promoted' && v.vacancy !== 'demoted') return false;
  if (typeof v.gradeRoll !== 'number' || !Number.isInteger(v.gradeRoll) || v.gradeRoll < 1 || v.gradeRoll > 6) return false;
  if (v.grade !== replacementGrade(v.vacancy, v.gradeRoll)) return false;
  if (typeof v.city !== 'string' || typeof v.name !== 'string' || typeof v.primaryColor !== 'string' || typeof v.secondaryColor !== 'string') return false;
  const identity = validateIdentityInput({
    city: v.city,
    name: v.name,
    primaryColor: v.primaryColor,
    secondaryColor: v.secondaryColor,
  });
  if (!identity.ok) return false;
  const clean = identity.value;
  if (clean.city !== v.city || clean.name !== v.name || clean.primaryColor !== v.primaryColor || clean.secondaryColor !== v.secondaryColor) return false;
  return isRoster({ franchiseId: v.id, leagueId, players: v.players });
}

function isStagedTeamChange(value: unknown): value is StagedTeamChange {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const named = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
  if (!named(v.franchiseId) || !named(v.protectedId)) return false;
  if (v.retiredId === undefined && v.releasedId === undefined) return true;
  if (!named(v.retiredId) || !named(v.releasedId)) return false;
  return new Set([v.protectedId, v.retiredId, v.releasedId]).size === 3;
}

export function isOffseasonPlan(value: unknown): value is OffseasonPlan {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.seasonId !== 'string' || v.seasonId.length === 0) return false;
  if (typeof v.leagueId !== 'string' || v.leagueId.length === 0) return false;
  if (!isIdList(v.promoted) || !isIdList(v.demoted)) return false;
  const all = [...v.promoted, ...v.demoted];
  if (new Set(all).size !== all.length) return false;
  let arrivalIds: string[] = [];
  if (v.arrivals !== undefined) {
    if (!Array.isArray(v.arrivals) || !v.arrivals.every(isStagedArrival)) return false;
    arrivalIds = v.arrivals.map((a: StagedArrival) => a.franchiseId);
    if (new Set(arrivalIds).size !== arrivalIds.length) return false;
  }
  if (v.newTeams !== undefined) {
    const leagueId = v.leagueId;
    if (!Array.isArray(v.newTeams) || !v.newTeams.every((t) => isStagedNewTeam(t, leagueId))) return false;
    const ids = v.newTeams.map((t: StagedNewTeam) => t.id);
    if (new Set([...ids, ...arrivalIds]).size !== ids.length + arrivalIds.length) return false;
  }
  if (v.teamChanges !== undefined) {
    if (!Array.isArray(v.teamChanges) || !v.teamChanges.every(isStagedTeamChange)) return false;
    if (new Set(v.teamChanges.map((c: StagedTeamChange) => c.franchiseId)).size !== v.teamChanges.length) return false;
  }
  if (v.freeAgentPicks !== undefined) {
    if (!Array.isArray(v.freeAgentPicks)) return false;
    const picks = v.freeAgentPicks as unknown[];
    const valid = picks.every((p) => {
      if (typeof p !== 'object' || p === null) return false;
      const q = p as Record<string, unknown>;
      return typeof q.franchiseId === 'string' && q.franchiseId.length > 0 && typeof q.playerId === 'string' && q.playerId.length > 0;
    });
    if (!valid) return false;
    const list = picks as StagedFreeAgentPick[];
    if (new Set(list.map((p) => p.franchiseId)).size !== list.length) return false;
    if (new Set(list.map((p) => p.playerId)).size !== list.length) return false;
  }
  let poolIds = new Set<string>();
  if (v.draftPool !== undefined) {
    if (!Array.isArray(v.draftPool) || !v.draftPool.every(isDraftee)) return false;
    poolIds = new Set((v.draftPool as RosterPlayer[]).map((p) => p.id));
    if (poolIds.size !== v.draftPool.length) return false;
  }
  if (v.draftPicks !== undefined) {
    if (v.draftPool === undefined || !Array.isArray(v.draftPicks)) return false;
    const picks = v.draftPicks as unknown[];
    const valid = picks.every((p) => {
      if (typeof p !== 'object' || p === null) return false;
      const q = p as Record<string, unknown>;
      return typeof q.franchiseId === 'string' && q.franchiseId.length > 0 && typeof q.playerId === 'string' && poolIds.has(q.playerId);
    });
    if (!valid) return false;
    if (new Set((picks as StagedDraftPick[]).map((p) => p.playerId)).size !== picks.length) return false;
  }
  if (v.progression !== undefined) {
    if (!Array.isArray(v.progression)) return false;
    const list = v.progression as unknown[];
    const valid = list.every((r) => {
      if (typeof r !== 'object' || r === null) return false;
      const q = r as Record<string, unknown>;
      if (typeof q.franchiseId !== 'string' || q.franchiseId.length === 0) return false;
      if (typeof q.playerId !== 'string' || q.playerId.length === 0) return false;
      if (typeof q.roll !== 'number' || !Number.isInteger(q.roll) || q.roll < 1 || q.roll > 6) return false;
      if (q.after !== undefined && q.replacement !== undefined) return false;
      if (q.after !== undefined && !isPlayerAged(q.after, 18)) return false;
      if (q.replacement !== undefined && !isDraftee(q.replacement)) return false;
      return true;
    });
    if (!valid) return false;
    if (new Set((list as StagedProgression[]).map((r) => r.playerId)).size !== list.length) return false;
  }
  return true;
}
