import { LEAGUE_COLLECTION, type League } from '@/leagues/league';
import { getBurnedNames } from '@/names/name-registry';
import { generateLeagueRosters } from '@/rosters/roster-repository';
import { acceptLeague } from '@/seasons/accept-league';
import { finishSeason } from '@/seasons/season-archive-repository';
import { createMemoryDatabase } from '@/storage/memory-database';
import type { Database } from '@/storage/types';
import { generateDraftStandard } from '@/rosters/roster';
import { createFranchise, listFranchises } from '@/teams/franchise-repository';
import { OFFSEASON_PLAN_COLLECTION } from './offseason-plan';
import { addNewTeam, getOffseasonPlan, planErrorText, removeNewTeam, rerollNewTeam, saveOffseasonPlan, stageArrivals } from './offseason-plan-repository';

const make = (id: string, extra: Partial<League> = {}): League => ({
  id, name: `League ${id}`, size: 6, namingStyle: 'cityAndName', relegation: true, promotedCount: 1, demotedCount: 1, ...extra,
});

let counter = 0;
const nextId = () => `t-${++counter}`;
let teamCounter = 0;
const newId = () => `n-${++teamCounter}`;

/** Every die shows `face`, so the grade roll is `face` and the other rolls are 2 x face. */
const constRng = (face: number) => () => (face - 0.5) / 6;

const identity = (name: string) => ({ city: 'Richmond', name, primaryColor: '#112233', secondaryColor: '#ffffff' });

async function build(db: Database, league: League, end = true) {
  await db.batch([{ type: 'put', collection: LEAGUE_COLLECTION, id: league.id, value: league }]);
  for (let i = 0; i < league.size; i += 1) {
    const r = await createFranchise(
      db,
      league,
      { city: 'City', name: `${league.id}-Team${i}`, primaryColor: '#000000', secondaryColor: '#ffffff', initialGrade: 'B' },
      nextId,
    );
    if (!r.ok) throw new Error('team');
  }
  await generateLeagueRosters(db, league);
  const a = await acceptLeague(db, league, () => `s-${league.id}`);
  if (!a.ok) throw new Error('accept');
  const teams = await listFranchises(db, league);
  if (!teams.ok) throw new Error('teams');
  const ids = teams.value.teams.map((t) => t.id);
  if (end) await finishSeason(db, league, ids);
  return ids;
}

/** An unlinked league with its plan saved, so both sides have one open place. */
async function solo() {
  const db = createMemoryDatabase();
  const l = make('S');
  const ids = await build(db, l);
  await saveOffseasonPlan(db, l, [ids[0]], [ids[5]]);
  return { db, l, ids };
}

/** Upper and lower leagues, both ended with plans saved: U has no league above, L has none below. */
async function pair() {
  const db = createMemoryDatabase();
  const u = make('U', { leagueBelowId: 'L' });
  const l = make('L', { leagueAboveId: 'U' });
  const uIds = await build(db, u);
  const lIds = await build(db, l);
  await saveOffseasonPlan(db, u, [uIds[0]], [uIds[5]]);
  await saveOffseasonPlan(db, l, [lIds[0]], [lIds[5]]);
  return { db, u, l, uIds, lIds };
}

const planOf = async (db: Database, seasonId: string) => {
  const r = await getOffseasonPlan(db, seasonId);
  if (!r.ok || r.value === null) throw new Error('plan');
  return r.value;
};

describe('addNewTeam', () => {
  it('stages a team in each open place of an unlinked league and rolls the grade by side', async () => {
    const { db, l } = await solo();
    const up = await addNewTeam(db, l, identity('Falcons'), 'promoted', { rng: constRng(1), newId });
    const down = await addNewTeam(db, l, identity('Bears'), 'demoted', { rng: constRng(6), newId });
    expect(up.ok && down.ok).toBe(true);
    const plan = await planOf(db, 's-S');
    expect(plan.newTeams).toHaveLength(2);
    expect(plan.newTeams?.[0]).toMatchObject({ vacancy: 'promoted', gradeRoll: 1, grade: 'A', name: 'Falcons', city: 'Richmond' });
    expect(plan.newTeams?.[1]).toMatchObject({ vacancy: 'demoted', gradeRoll: 6, grade: 'F' });
    expect(plan.newTeams?.every((t) => t.players.length === 8)).toBe(true);
  });

  it('only opens the sides without a linked league', async () => {
    const { db, u, l } = await pair();
    expect((await addNewTeam(db, u, identity('Falcons'), 'promoted', { rng: constRng(2), newId })).ok).toBe(true);
    expect(await addNewTeam(db, u, identity('Bears'), 'demoted', { rng: constRng(2), newId })).toMatchObject({ ok: false, error: { kind: 'no-vacancy' } });
    expect((await addNewTeam(db, l, identity('Wolves'), 'demoted', { rng: constRng(4), newId })).ok).toBe(true);
    expect(await addNewTeam(db, l, identity('Owls'), 'promoted', { rng: constRng(2), newId })).toMatchObject({ ok: false, error: { kind: 'no-vacancy' } });
  });

  it('refuses a second team for a full side', async () => {
    const { db, l } = await solo();
    await addNewTeam(db, l, identity('Falcons'), 'promoted', { newId });
    expect(await addNewTeam(db, l, identity('Hawks'), 'promoted', { newId })).toMatchObject({ ok: false, error: { kind: 'no-vacancy' } });
  });

  it('refuses a name used by a live team, ignoring case and spaces, including in the linked chain', async () => {
    const { db, u } = await pair();
    const own = await addNewTeam(db, u, identity(' u-team0 '), 'promoted', { newId });
    expect(own).toMatchObject({ ok: false, error: { kind: 'validation', fields: { name: expect.any(String) } } });
    const linked = await addNewTeam(db, u, identity('L-TEAM1'), 'promoted', { newId });
    expect(linked).toMatchObject({ ok: false, error: { kind: 'validation' } });
    expect((await planOf(db, 's-U')).newTeams).toBeUndefined();
  });

  it('refuses a name already staged in the same chain but allows it in an unrelated league', async () => {
    const { db, u, l } = await pair();
    await addNewTeam(db, u, identity('Falcons'), 'promoted', { newId });
    expect(await addNewTeam(db, l, identity('falcons'), 'demoted', { newId })).toMatchObject({ ok: false, error: { kind: 'validation' } });
    const other = await solo();
    expect((await addNewTeam(other.db, other.l, identity('Falcons'), 'promoted', { newId })).ok).toBe(true);
  });

  it('rejects invalid identity fields without writing', async () => {
    const { db, l } = await solo();
    const r = await addNewTeam(db, l, { city: '', name: 'x', primaryColor: 'red', secondaryColor: '#ffffff' }, 'promoted', { newId });
    expect(r).toMatchObject({ ok: false, error: { kind: 'validation', fields: { city: expect.any(String), primaryColor: expect.any(String) } } });
    expect((await planOf(db, 's-S')).newTeams).toBeUndefined();
  });

  it('never uses a burned name or repeats a name across staged teams in different leagues', async () => {
    const { db, u, l } = await pair();
    await addNewTeam(db, u, identity('Falcons'), 'promoted', { newId });
    await addNewTeam(db, l, identity('Wolves'), 'demoted', { newId });
    const burned = await getBurnedNames(db);
    if (!burned.ok) throw new Error('burned');
    const names = [...(await planOf(db, 's-U')).newTeams!, ...(await planOf(db, 's-L')).newTeams!].flatMap((t) => t.players.map((p) => p.name));
    expect(names).toHaveLength(16);
    expect(new Set(names).size).toBe(16);
    expect(names.some((n) => burned.value.has(n))).toBe(false);
  });

  it('never uses the name of a staged draftee, in this league or another', async () => {
    const { db, u, l } = await pair();
    const draftee = (id: string, name: string) => generateDraftStandard(constRng(3), () => name, () => id);
    const withPool = async (seasonId: string, names: string[]) => {
      const plan = await planOf(db, seasonId);
      await db.batch([{ type: 'put', collection: OFFSEASON_PLAN_COLLECTION, id: seasonId, value: { ...plan, draftPool: names.map((n, i) => draftee(`d-${seasonId}-${i}`, n)) } }]);
    };
    const own = ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE', 'FFFF', 'GGGG', 'HHHH'];
    await withPool('s-L', own.slice(0, 4));
    await withPool('s-U', own.slice(4));
    // Only draftee names in the name pool: nothing is left for a new team.
    expect(await addNewTeam(db, l, identity('Wolves'), 'demoted', { newId, pool: own })).toMatchObject({ ok: false, error: { kind: 'no-names' } });
    // With free names added, only those are used.
    const free = ['IIII', 'JJJJ', 'KKKK', 'LLLL', 'MMMM', 'NNNN', 'OOOO', 'PPPP'];
    expect((await addNewTeam(db, l, identity('Wolves'), 'demoted', { newId, pool: [...own, ...free] })).ok).toBe(true);
    const team = (await planOf(db, 's-L')).newTeams![0];
    expect(team.players.every((p) => free.includes(p.name))).toBe(true);
    // A reroll keeps avoiding them too.
    expect((await rerollNewTeam(db, l, team.id, { pool: [...own, ...free] })).ok).toBe(true);
    expect((await planOf(db, 's-L')).newTeams![0].players.every((p) => free.includes(p.name))).toBe(true);
    expect(await rerollNewTeam(db, l, team.id, { pool: own })).toMatchObject({ ok: false, error: { kind: 'no-names' } });
    void u;
  });

  it('never uses the name of a staged progression replacement', async () => {
    const { db, l } = await solo();
    const names = ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE', 'FFFF', 'GGGG', 'HHHH'];
    const plan = await planOf(db, 's-S');
    const progression = names.map((n, i) => ({ franchiseId: 'x', playerId: `p${i}`, roll: 1, replacement: generateDraftStandard(constRng(3), () => n, () => `r${i}`) }));
    await db.batch([{ type: 'put', collection: OFFSEASON_PLAN_COLLECTION, id: 's-S', value: { ...plan, progression } }]);
    expect(await addNewTeam(db, l, identity('Wolves'), 'demoted', { newId, pool: names })).toMatchObject({ ok: false, error: { kind: 'no-names' } });
  });

  it('reports pool exhaustion as no-names and writes nothing', async () => {
    const { db, l } = await solo();
    const r = await addNewTeam(db, l, identity('Falcons'), 'promoted', { newId, pool: ['AAAA'] });
    expect(r).toMatchObject({ ok: false, error: { kind: 'no-names' } });
    expect((await planOf(db, 's-S')).newTeams).toBeUndefined();
  });

  it('needs a season in the offseason and a saved plan', async () => {
    const db = createMemoryDatabase();
    const l = make('S');
    expect(await addNewTeam(db, l, identity('A'), 'promoted')).toMatchObject({ ok: false, error: { kind: 'no-season' } });
    await build(db, l, false);
    expect(await addNewTeam(db, l, identity('A'), 'promoted')).toMatchObject({ ok: false, error: { kind: 'not-offseason' } });
    const ended = createMemoryDatabase();
    const e = make('E');
    await build(ended, e);
    expect(await addNewTeam(ended, e, identity('A'), 'promoted')).toMatchObject({ ok: false, error: { kind: 'no-plan' } });
  });

  it('keeps the old plan when the batch fails and fails closed on an unreadable plan', async () => {
    const { db, l } = await solo();
    const failing: Database = { ...db, get: db.get.bind(db), list: db.list.bind(db), close: db.close.bind(db), batch: async () => ({ ok: false, error: new Error('disk full') }) };
    expect(await addNewTeam(failing, l, identity('Falcons'), 'promoted', { newId })).toMatchObject({ ok: false, error: { kind: 'storage' } });
    expect((await planOf(db, 's-S')).newTeams).toBeUndefined();
    await db.batch([{ type: 'put', collection: OFFSEASON_PLAN_COLLECTION, id: 'junk', value: { seasonId: 'junk' } }]);
    expect(await addNewTeam(db, l, identity('Falcons'), 'promoted', { newId })).toMatchObject({ ok: false, error: { kind: 'storage' } });
  });
});

describe('rerollNewTeam and removeNewTeam', () => {
  it('rerolls the grade and roster but keeps the id, side and identity', async () => {
    const { db, l } = await solo();
    await addNewTeam(db, l, identity('Falcons'), 'promoted', { rng: constRng(1), newId });
    const before = (await planOf(db, 's-S')).newTeams![0];
    expect((await rerollNewTeam(db, l, before.id, { rng: constRng(6) })).ok).toBe(true);
    const after = (await planOf(db, 's-S')).newTeams![0];
    expect(after).toMatchObject({ id: before.id, vacancy: 'promoted', name: 'Falcons', city: 'Richmond', gradeRoll: 6, grade: 'C' });
    expect(after.players.map((p) => p.id)).not.toEqual(before.players.map((p) => p.id));
    expect(after.players).toHaveLength(8);
  });

  it('removes a team and frees its place', async () => {
    const { db, l } = await solo();
    await addNewTeam(db, l, identity('Falcons'), 'promoted', { newId });
    const id = (await planOf(db, 's-S')).newTeams![0].id;
    expect((await removeNewTeam(db, l, id)).ok).toBe(true);
    expect((await planOf(db, 's-S')).newTeams).toEqual([]);
    expect((await addNewTeam(db, l, identity('Falcons'), 'promoted', { newId })).ok).toBe(true);
  });

  it('reports an unknown team', async () => {
    const { db, l } = await solo();
    expect(await rerollNewTeam(db, l, 'nope')).toMatchObject({ ok: false, error: { kind: 'not-found' } });
    expect(await removeNewTeam(db, l, 'nope')).toMatchObject({ ok: false, error: { kind: 'not-found' } });
    expect(planErrorText({ kind: 'not-found' }, l).length).toBeGreaterThan(0);
  });
});

describe('plan writes keep new teams', () => {
  it('survives saving departures again and staging arrivals', async () => {
    const { db, u, l, uIds, lIds } = await pair();
    await addNewTeam(db, l, identity('Wolves'), 'demoted', { newId });
    const staged = (await planOf(db, 's-L')).newTeams;
    expect((await saveOffseasonPlan(db, l, [lIds[1]], [lIds[4]])).ok).toBe(true);
    expect((await planOf(db, 's-L')).newTeams).toEqual(staged);
    expect((await stageArrivals(db, l, constRng(3))).ok).toBe(true);
    const plan = await planOf(db, 's-L');
    expect(plan.newTeams).toEqual(staged);
    expect(plan.arrivals).toBeDefined();
    expect(u.id).toBe('U');
    expect(uIds.length).toBe(6);
  });

  it('has text for the new errors', () => {
    const l = make('S');
    for (const kind of ['no-vacancy', 'no-names'] as const) expect(planErrorText({ kind }, l).length).toBeGreaterThan(0);
    expect(planErrorText({ kind: 'validation', fields: { city: 'Enter a city.' } }, l)).toBe('Enter a city.');
  });
});
