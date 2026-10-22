import type { League } from '@/leagues/league';
import type { GoalieRosterPlayer, RosterPlayer, StandardRosterPlayer } from '@/rosters/roster';
import type { Season } from '@/seasons/season';
import type { ArchivedTeam, SeasonArchive } from '@/seasons/season-archive';
import type { Franchise } from '@/teams/franchise';
import { approvalErrorText, buildApproval, finalRoster, type ChainLeague } from './approval';
import type { OffseasonPlan, StagedNewTeam } from './offseason-plan';
import type { ParticipatingTeam } from './roster-changes';

const std = (id: string, age = 25): StandardRosterPlayer => ({
  id, kind: 'standard', name: id.toUpperCase(), age, offense: 3, defense: 3, sportsmanship: 3, controlStars: 0, rolls: { age: 7, total: 7, split: null, stars: 3, sportsmanship: 3 },
});
const goalie = (id: string, age = 25): GoalieRosterPlayer => ({
  id, kind: 'goalie', name: id.toUpperCase(), age, goaltending: 33, sportsmanship: 3, rolls: { age: 7, goaltending: 7, sportsmanship: 3 },
});
const eight = (id: string): RosterPlayer[] => [...[1, 2, 3, 4, 5, 6].map((i) => std(`${id}-s${i}`)), goalie(`${id}-g1`), goalie(`${id}-g2`)];

const league = (id: string): League => ({ id, name: id, size: 2 as League['size'], namingStyle: 'cityAndName', relegation: true, promotedCount: 1, demotedCount: 1 });
const franchise = (id: string, leagueId: string): Franchise => ({
  id, leagueId, initialGrade: 'B', identities: [{ fromSeason: 1, city: 'City', name: id, primaryColor: '#000000', secondaryColor: '#ffffff' }],
});
const archive = (seasonId: string, leagueId: string, ids: string[]): SeasonArchive => ({
  seasonId, leagueId, seasonIndex: 1,
  teams: ids.map((id, i): ArchivedTeam => ({ franchiseId: id, position: i + 1, identity: franchise(id, leagueId).identities[0], initialGrade: 'B', players: eight(id) })),
});
const season = (id: string, leagueId: string): Season => ({ id, leagueId, index: 1, status: 'offseason' });
const noChange = (teams: ParticipatingTeam[]) => teams.flatMap((t) => t.players.map((p) => ({ franchiseId: t.franchiseId, playerId: p.id, roll: 3 })));
const staying = (id: string): ParticipatingTeam => ({ franchiseId: id, origin: 'staying', players: eight(id) });
const arriving = (id: string): ParticipatingTeam => ({ franchiseId: id, origin: 'arrival', players: eight(id) });
const arrival = (id: string, from: string, movement: 'promoted' | 'demoted') => ({ franchiseId: id, fromLeagueId: from, sourceSeasonId: `s-${from}`, movement, players: eight(id) });
const ids = (() => { let n = 0; return () => `new-${++n}`; })();

describe('finalRoster', () => {
  // Team a loses s1 (retired) and s2 (released), picks b's released player, and drafts one rookie.
  const a: ParticipatingTeam = staying('a');
  const b: ParticipatingTeam = staying('b');
  const teams = [a, b];
  const rookie = std('r1', 19);
  const replacement = goalie('rep', 21);
  const plan: OffseasonPlan = {
    seasonId: 's', leagueId: 'L', promoted: [], demoted: [],
    teamChanges: [{ franchiseId: 'a', protectedId: 'a-s3', retiredId: 'a-s1', releasedId: 'a-s2' }, { franchiseId: 'b', protectedId: 'b-s3', retiredId: 'b-s1', releasedId: 'b-s2' }],
    freeAgentPicks: [{ franchiseId: 'a', playerId: 'b-s2' }, { franchiseId: 'b', playerId: 'a-s2' }],
    draftPool: [rookie], draftPicks: [{ franchiseId: 'a', playerId: 'r1' }],
    progression: [
      { franchiseId: 'a', playerId: 'a-s3', roll: 1, after: { ...std('a-s3'), offense: 4 } },
      { franchiseId: 'a', playerId: 'a-s4', roll: 3 }, { franchiseId: 'a', playerId: 'a-s5', roll: 3 }, { franchiseId: 'a', playerId: 'a-s6', roll: 3 },
      { franchiseId: 'a', playerId: 'b-s2', roll: 3 },
      { franchiseId: 'a', playerId: 'a-g1', roll: 6, replacement }, { franchiseId: 'a', playerId: 'a-g2', roll: 3 },
    ],
  };

  it('ages kept and picked players, applies progression, and leaves rookies and replacements as they are', () => {
    const roster = finalRoster(a, teams, plan)!;
    const byId = (id: string) => roster.find((p) => p.id === id)!;
    expect(byId('a-s3')).toMatchObject({ age: 26, offense: 4 });
    expect(byId('a-s4').age).toBe(26);
    expect(byId('b-s2').age).toBe(26);
    expect(byId('r1').age).toBe(19);
    expect(byId('rep').age).toBe(21);
  });
  it('drops the retired, the released and the progression retiree, and puts position players first', () => {
    const roster = finalRoster(a, teams, plan)!;
    expect(roster.map((p) => p.id)).toEqual(['a-s3', 'a-s4', 'a-s5', 'a-s6', 'b-s2', 'r1', 'rep', 'a-g2']);
  });
  it('returns null when a progressing player has no result', () => {
    expect(finalRoster(a, teams, { ...plan, progression: plan.progression!.slice(1) })).toBeNull();
  });
  it('does not change the inputs', () => {
    const before = JSON.stringify(plan);
    finalRoster(a, teams, plan);
    expect(JSON.stringify(plan)).toBe(before);
  });
});

function solo(extra: Partial<OffseasonPlan> = {}, teams: ParticipatingTeam[] = [staying('a'), staying('b')]): ChainLeague {
  const plan: OffseasonPlan = { seasonId: 's-L', leagueId: 'L', promoted: [], demoted: [], progression: noChange(teams), ...extra };
  return { league: league('L'), season: season('s-L', 'L'), archive: archive('s-L', 'L', ['a', 'b']), plan, teams };
}
const fs = [franchise('a', 'L'), franchise('b', 'L')];

describe('buildApproval', () => {
  it('closes the season, opens the next one and rewrites every roster', () => {
    const r = buildApproval({ leagues: [solo()], franchises: fs, newId: ids });
    if (!r.ok) throw new Error('approval');
    expect(r.value.seasons).toEqual([
      { id: 's-L', leagueId: 'L', index: 1, status: 'archived' },
      { id: expect.any(String), leagueId: 'L', index: 2, status: 'active' },
    ]);
    expect(r.value.rosters.map((x) => x.franchiseId)).toEqual(['a', 'b']);
    expect(r.value.rosters[0]).toMatchObject({ leagueId: 'L' });
    expect(r.value.rosters[0].players.every((p) => p.age === 26)).toBe(true);
    expect(r.value.franchises).toEqual([]);
    expect(r.value.names).toHaveLength(16);
  });

  it('removes undrafted players from the kept plan and counts the changes', () => {
    const teams = [staying('a'), staying('b')];
    const plan = {
      teamChanges: [{ franchiseId: 'a', protectedId: 'a-s3', retiredId: 'a-s1', releasedId: 'a-s2' }],
      freeAgentPicks: [{ franchiseId: 'a', playerId: 'a-s2' }],
      draftPool: [std('r1', 19), std('r2', 19)], draftPicks: [{ franchiseId: 'a', playerId: 'r1' }],
      progression: noChange(teams).filter((e) => e.playerId !== 'a-s1'),
    };
    const r = buildApproval({ leagues: [solo(plan, teams)], franchises: fs, newId: ids });
    if (!r.ok) throw new Error('approval');
    expect(r.value.plans[0].draftPool?.map((p) => p.id)).toEqual(['r1']);
    expect(r.value.summaries).toEqual([{ leagueId: 'L', teams: 2, retired: 1, rookies: 1, newTeams: 0 }]);
    expect(r.value.names).not.toContain('R2');
    expect(r.value.newNames).toEqual(['R1']);
  });

  it('keeps a team that leaves with nowhere to go as an unassigned franchise and fills its place with a new team', () => {
    const fresh: StagedNewTeam = { id: 'n', vacancy: 'promoted', gradeRoll: 2, grade: 'C', city: 'Newtown', name: 'Novas', primaryColor: '#111111', secondaryColor: '#eeeeee', players: eight('n') };
    const teams = [staying('a')];
    const r = buildApproval({ leagues: [solo({ promoted: ['b'], newTeams: [fresh], progression: noChange(teams) }, teams)], franchises: fs, newId: ids });
    if (!r.ok) throw new Error('approval');
    const gone = r.value.franchises.find((f) => f.id === 'b')!;
    expect(gone.leagueId).toBeUndefined();
    const goneRoster = r.value.rosters.find((x) => x.franchiseId === 'b')!;
    expect(goneRoster.leagueId).toBeUndefined();
    expect(goneRoster.players.map((p) => p.age)).toEqual(Array(8).fill(25));
    expect(r.value.franchises.find((f) => f.id === 'n')).toEqual({
      id: 'n', leagueId: 'L', initialGrade: 'C', identities: [{ fromSeason: 2, city: 'Newtown', name: 'Novas', primaryColor: '#111111', secondaryColor: '#eeeeee' }],
    });
    expect(r.value.rosters.find((x) => x.franchiseId === 'n')).toMatchObject({ leagueId: 'L' });
    expect(r.value.names).toContain('N-S1');
    expect(r.value.names).not.toContain('B-S1');
  });

  it('moves teams between linked leagues instead of leaving them unassigned', () => {
    const uTeams = [staying('a'), arriving('c')];
    const lTeams = [staying('d'), arriving('b')];
    const u: ChainLeague = {
      league: league('U'), season: season('s-U', 'U'), archive: archive('s-U', 'U', ['a', 'b']),
      plan: { seasonId: 's-U', leagueId: 'U', promoted: [], demoted: ['b'], arrivals: [arrival('c', 'L', 'promoted')], progression: noChange(uTeams) }, teams: uTeams,
    };
    const l: ChainLeague = {
      league: league('L'), season: season('s-L', 'L'), archive: archive('s-L', 'L', ['c', 'd']),
      plan: { seasonId: 's-L', leagueId: 'L', promoted: ['c'], demoted: [], arrivals: [arrival('b', 'U', 'demoted')], progression: noChange(lTeams) }, teams: lTeams,
    };
    const all = [franchise('a', 'U'), franchise('b', 'U'), franchise('c', 'L'), franchise('d', 'L')];
    const r = buildApproval({ leagues: [u, l], franchises: all, newId: ids });
    if (!r.ok) throw new Error('approval');
    expect(r.value.franchises.map((f) => [f.id, f.leagueId])).toEqual([['c', 'U'], ['b', 'L']]);
    expect(r.value.rosters.map((x) => [x.franchiseId, x.leagueId])).toEqual([['a', 'U'], ['c', 'U'], ['d', 'L'], ['b', 'L']]);
    expect(r.value.seasons.map((s) => s.status)).toEqual(['archived', 'archived', 'active', 'active']);
  });

  it('reports each problem', () => {
    const teams = [staying('a'), staying('b')];
    expect(buildApproval({ leagues: [solo({ progression: noChange(teams).slice(1) })], franchises: fs, newId: ids })).toEqual({ ok: false, error: { kind: 'progression-missing', franchiseId: 'a' } });
    expect(buildApproval({ leagues: [solo({}, [staying('a')])], franchises: fs, newId: ids })).toEqual({ ok: false, error: { kind: 'wrong-team-count', leagueId: 'L', teams: 1, size: 2 } });
    const short = { ...staying('a'), players: eight('a').slice(1) };
    const shortTeams = [short, staying('b')];
    expect(buildApproval({ leagues: [solo({ progression: noChange(shortTeams) }, shortTeams)], franchises: fs, newId: ids })).toEqual({ ok: false, error: { kind: 'roster-shape', franchiseId: 'a' } });
    expect(buildApproval({ leagues: [solo()], franchises: [franchise('b', 'L')], newId: ids }).ok).toBe(true);
    const moved = [staying('a'), arriving('c')];
    expect(buildApproval({ leagues: [solo({ arrivals: [arrival('c', 'M', 'promoted')], progression: noChange(moved) }, moved)], franchises: fs, newId: ids })).toEqual({ ok: false, error: { kind: 'missing-franchise', franchiseId: 'c' } });
  });

  it('has text for every error', () => {
    for (const error of [
      { kind: 'roster-shape', franchiseId: 'a' }, { kind: 'progression-missing', franchiseId: 'a' },
      { kind: 'wrong-team-count', leagueId: 'L', teams: 1, size: 2 }, { kind: 'missing-franchise', franchiseId: 'a' },
    ] as const) expect(approvalErrorText(error).length).toBeGreaterThan(0);
  });
});
