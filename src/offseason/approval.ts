import { limitTeamStars, teamStars } from '@/rosters/control-stars';
import type { League } from '@/leagues/league';
import { GOALTENDERS, STANDARD_PLAYERS, type Roster, type RosterPlayer } from '@/rosters/roster';
import type { Season } from '@/seasons/season';
import type { SeasonArchive } from '@/seasons/season-archive';
import type { Franchise } from '@/teams/franchise';
import type { OffseasonPlan } from './offseason-plan';
import { progressionPlayers } from './progression';
import { rookiesPickedBy } from './rookie-draft';
import { AGING_YEARS, type ParticipatingTeam } from './roster-changes';

/** One league of the chain being approved, with everything its wizard staged. */
export interface ChainLeague {
  league: League;
  season: Season;
  archive: SeasonArchive;
  plan: OffseasonPlan;
  teams: ParticipatingTeam[];
}

export type ApprovalError =
  | { kind: 'roster-shape'; franchiseId: string }
  | { kind: 'progression-missing'; franchiseId: string }
  | { kind: 'wrong-team-count'; leagueId: string; teams: number; size: number }
  | { kind: 'missing-franchise'; franchiseId: string };

/** What one league gets from the approval, for the summary shown before approving. */
export interface LeagueSummary {
  leagueId: string;
  teams: number;
  /** Players retired by aging and by progression. */
  retired: number;
  rookies: number;
  newTeams: number;
}

export interface Approval {
  /** Closed seasons (status `archived`) followed by the new active seasons. */
  seasons: Season[];
  /** Franchise documents to write: moved, new and unassigned teams. Teams that stay are unchanged. */
  franchises: Franchise[];
  /** Roster documents to write for every team in a new season and every unassigned team. */
  rosters: Roster[];
  /** Plans with the undrafted players removed. */
  plans: OffseasonPlan[];
  /** Every player name on a roster of the new seasons. */
  names: string[];
  /** The names that are new this offseason: rookies who were picked, progression replacements and new teams' players. */
  newNames: string[];
  summaries: LeagueSummary[];
}

export type ApprovalResult = { ok: true; value: Approval } | { ok: false; error: ApprovalError };

/**
 * The roster a participating team takes into the next season before its control stars are corrected: kept players and free
 * agency picks aged a year with their progression applied, replacements and rookies as drafted, position players first
 * and goaltenders last. Null when a player has no progression result.
 */
function rosterBeforeStars(team: ParticipatingTeam, teams: readonly ParticipatingTeam[], plan: OffseasonPlan): RosterPlayer[] | null {
  const results = new Map((plan.progression ?? []).filter((r) => r.franchiseId === team.franchiseId).map((r) => [r.playerId, r]));
  const kept: RosterPlayer[] = [];
  for (const player of progressionPlayers(team, teams, plan)) {
    const result = results.get(player.id);
    if (result === undefined) return null;
    kept.push(result.replacement ?? { ...(result.after ?? player), age: player.age + AGING_YEARS });
  }
  const all = [...kept, ...rookiesPickedBy(team.franchiseId, plan)];
  return [...all.filter((p) => p.kind === 'standard'), ...all.filter((p) => p.kind === 'goalie')];
}

/** The roster a participating team takes into the next season, with its control stars kept between 2 and 6. Null when a player has no progression result. */
export function finalRoster(team: ParticipatingTeam, teams: readonly ParticipatingTeam[], plan: OffseasonPlan): RosterPlayer[] | null {
  const players = rosterBeforeStars(team, teams, plan);
  return players === null ? null : limitTeamStars(players);
}

/** The team's control stars before and after the correction at approval, or null when nothing changes (or progression is missing). */
export function starAdjustment(team: ParticipatingTeam, teams: readonly ParticipatingTeam[], plan: OffseasonPlan): { before: number; after: number } | null {
  const players = rosterBeforeStars(team, teams, plan);
  if (players === null) return null;
  const before = teamStars(players);
  const after = teamStars(limitTeamStars(players));
  return before === after ? null : { before, after };
}

const hasShape = (players: readonly RosterPlayer[]) =>
  players.filter((p) => p.kind === 'standard').length === STANDARD_PLAYERS &&
  players.filter((p) => p.kind === 'goalie').length === GOALTENDERS &&
  new Set(players.map((p) => p.id)).size === players.length;

/** Every write the approval makes for a chain of leagues. `franchises` are the saved teams of those leagues. */
export function buildApproval(input: { leagues: readonly ChainLeague[]; franchises: readonly Franchise[]; newId: () => string }): ApprovalResult {
  const { leagues, franchises, newId } = input;
  const fail = (error: ApprovalError): ApprovalResult => ({ ok: false, error });
  const closed: Season[] = [];
  const opened: Season[] = [];
  const writtenFranchises: Franchise[] = [];
  const rosters: Roster[] = [];
  const plans: OffseasonPlan[] = [];
  const summaries: LeagueSummary[] = [];
  const names: string[] = [];
  const newNames: string[] = [];
  const arrivingIds = new Set(leagues.flatMap((l) => (l.plan.arrivals ?? []).map((a) => a.franchiseId)));

  for (const { league, season, archive, plan, teams } of leagues) {
    const newTeams = plan.newTeams ?? [];
    if (teams.length + newTeams.length !== league.size) return fail({ kind: 'wrong-team-count', leagueId: league.id, teams: teams.length + newTeams.length, size: league.size });
    const nextIndex = season.index + 1;
    closed.push({ ...season, status: 'archived' });
    opened.push({ id: newId(), leagueId: league.id, index: nextIndex, status: 'active' });

    for (const team of teams) {
      const players = finalRoster(team, teams, plan);
      if (players === null) return fail({ kind: 'progression-missing', franchiseId: team.franchiseId });
      if (!hasShape(players)) return fail({ kind: 'roster-shape', franchiseId: team.franchiseId });
      rosters.push({ franchiseId: team.franchiseId, leagueId: league.id, players });
      names.push(...players.map((p) => p.name));
      if (team.origin === 'arrival') {
        const franchise = franchises.find((f) => f.id === team.franchiseId);
        if (franchise === undefined) return fail({ kind: 'missing-franchise', franchiseId: team.franchiseId });
        writtenFranchises.push({ ...franchise, leagueId: league.id });
      }
    }
    for (const team of newTeams) {
      if (!hasShape(team.players)) return fail({ kind: 'roster-shape', franchiseId: team.id });
      writtenFranchises.push({
        id: team.id,
        leagueId: league.id,
        initialGrade: team.grade,
        identities: [{ fromSeason: nextIndex, city: team.city, name: team.name, primaryColor: team.primaryColor, secondaryColor: team.secondaryColor }],
      });
      rosters.push({ franchiseId: team.id, leagueId: league.id, players: team.players });
      names.push(...team.players.map((p) => p.name));
      newNames.push(...team.players.map((p) => p.name));
    }

    // A team leaving with nowhere to arrive keeps its franchise and its season-end roster, with no league.
    for (const id of [...plan.promoted, ...plan.demoted]) {
      if (arrivingIds.has(id)) continue;
      const franchise = franchises.find((f) => f.id === id);
      const archived = archive.teams.find((t) => t.franchiseId === id);
      if (franchise === undefined || archived === undefined) return fail({ kind: 'missing-franchise', franchiseId: id });
      const { leagueId: _left, ...unassigned } = franchise;
      writtenFranchises.push(unassigned);
      rosters.push({ franchiseId: id, players: structuredClone(archived.players) });
    }

    const picked = new Set((plan.draftPicks ?? []).map((p) => p.playerId));
    newNames.push(...(plan.draftPool ?? []).filter((p) => picked.has(p.id)).map((p) => p.name));
    newNames.push(...(plan.progression ?? []).flatMap((r) => (r.replacement === undefined ? [] : [r.replacement.name])));
    plans.push({ ...plan, ...(plan.draftPool === undefined ? {} : { draftPool: plan.draftPool.filter((p) => picked.has(p.id)) }) });
    summaries.push({
      leagueId: league.id,
      teams: league.size,
      retired: (plan.teamChanges ?? []).filter((c) => c.retiredId !== undefined).length + (plan.progression ?? []).filter((r) => r.replacement !== undefined).length,
      rookies: picked.size,
      newTeams: newTeams.length,
    });
  }
  return { ok: true, value: { seasons: [...closed, ...opened], franchises: writtenFranchises, rosters, plans, names, newNames, summaries } };
}

export function approvalErrorText(error: ApprovalError): string {
  switch (error.kind) {
    case 'roster-shape':
      return 'A team would not end up with 6 position players and 2 goaltenders. Redo the earlier steps for it.';
    case 'progression-missing':
      return 'Progression has not been rolled for every player. Run it again.';
    case 'wrong-team-count':
      return `A league would have ${error.teams} teams instead of ${error.size}. Fill every open place with a new team.`;
    case 'missing-franchise':
      return 'A team in the offseason plan could not be found.';
  }
}
