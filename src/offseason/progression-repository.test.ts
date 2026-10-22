import { LEAGUE_COLLECTION, type League } from '@/leagues/league';
import { generateLeagueRosters } from '@/rosters/roster-repository';
import { isRoster, ROSTER_COLLECTION } from '@/rosters/roster';
import { acceptLeague } from '@/seasons/accept-league';
import { finishSeason } from '@/seasons/season-archive-repository';
import { createMemoryDatabase } from '@/storage/memory-database';
import type { Database } from '@/storage/types';
import { createFranchise, FRANCHISE_COLLECTION, listFranchises } from '@/teams/franchise-repository';
import { getOffseasonPlan, planErrorText, saveOffseasonPlan, stageArrivals } from './offseason-plan-repository';
import { ageAndRelease, load, makeFreeAgentPick, setProtection, undoFreeAgentPick } from './roster-changes-repository';
import { generateDraftPool, makeRookiePick, undoRookiePick } from './rookie-draft-repository';
import { runProgression } from './progression-repository';
import { progressionPlayers } from './progression';
import { OFFSEASON_PLAN_COLLECTION, type OffseasonPlan } from './offseason-plan';
import { SEASON_ARCHIVE_COLLECTION } from '@/seasons/season-archive';
import { rookieDraftOrder, rookieOnTheClock, rookiePool, teamNeeds } from './rookie-draft';

const make = (id: string, extra: Partial<League> = {}): League => ({
  id, name: `League ${id}`, size: 6, namingStyle: 'cityAndName', relegation: true, promotedCount: 1, demotedCount: 1, ...extra,
});

let counter = 0;
const nextId = () => `t-${++counter}`;

async function build(db: Database, league: League) {
  await db.batch([{ type: 'put', collection: LEAGUE_COLLECTION, id: league.id, value: league }]);
  for (let i = 0; i < league.size; i += 1) {
    const r = await createFranchise(db, league, { city: 'City', name: `${league.id}-Team${i}`, primaryColor: '#000000', secondaryColor: '#ffffff', initialGrade: 'B' }, nextId);
    if (!r.ok) throw new Error('team');
  }
  await generateLeagueRosters(db, league);
  const a = await acceptLeague(db, league, () => `s-${league.id}`);
  if (!a.ok) throw new Error('accept');
  const teams = await listFranchises(db, league);
  if (!teams.ok) throw new Error('teams');
  const ids = teams.value.teams.map((t) => t.id);
  await finishSeason(db, league, ids);
  return ids;
}

const planOf = async (db: Database, seasonId: string) => {
  const r = await getOffseasonPlan(db, seasonId);
  if (!r.ok || r.value === null) throw new Error('plan');
  return r.value;
};

async function protectAll(db: Database, league: League, ids: string[]) {
  for (const id of ids) {
    const l = await load(db, league);
    if (!l.ok) throw new Error('load');
    const team = l.teams.find((t) => t.franchiseId === id)!;
    expect((await setProtection(db, league, id, team.players[0].id)).ok).toBe(true);
  }
}

async function freeAgency(db: Database, l: League) {
  for (;;) {
    const loaded = await load(db, l);
    if (!loaded.ok) throw new Error('load');
    const { plan } = loaded;
    const picked = new Set((plan.freeAgentPicks ?? []).map((p) => p.playerId));
    const next = (plan.teamChanges ?? []).map((c) => c.releasedId!).find((id) => !picked.has(id));
    if (next === undefined || !(await makeFreeAgentPick(db, l, next)).ok) return;
  }
}

/** A solo league taken through protection, aging and free agency. */
async function solo() {
  const db = createMemoryDatabase();
  const l = make('S');
  const ids = await build(db, l);
  await saveOffseasonPlan(db, l, [ids[0]], [ids[5]]);
  await protectAll(db, l, ids.slice(1, 5));
  await ageAndRelease(db, l, { rng: () => 0 });
  await freeAgency(db, l);
  return { db, l, ids };
}

async function pair() {
  const db = createMemoryDatabase();
  const u = make('U', { leagueBelowId: 'L' });
  const l = make('L', { leagueAboveId: 'U' });
  const uIds = await build(db, u);
  const lIds = await build(db, l);
  await saveOffseasonPlan(db, u, [uIds[0]], [uIds[5]]);
  await saveOffseasonPlan(db, l, [lIds[0]], [lIds[5]]);
  await stageArrivals(db, l);
  await stageArrivals(db, u);
  await protectAll(db, l, [...lIds.slice(1, 5), uIds[5]]);
  await ageAndRelease(db, l, { rng: () => 0 });
  await freeAgency(db, l);
  return { db, u, l, uIds, lIds };
}

/** Drafts until every team is full, always taking a pool player of a kind the team on the clock needs. Returns the franchise ids in pick order. */
async function draftAll(db: Database, l: League) {
  const order: string[] = [];
  for (;;) {
    const loaded = await load(db, l);
    if (!loaded.ok) throw new Error('load');
    const { plan, teams, archive, sourceArchives } = loaded;
    const clock = rookieOnTheClock(rookieDraftOrder(archive, plan, sourceArchives), teams, plan);
    if (clock === null) return order;
    const needs = teamNeeds(teams.find((t) => t.franchiseId === clock)!, teams, plan);
    const player = rookiePool(plan).find((p) => (p.kind === 'goalie' ? needs.goalies : needs.standard) > 0)!;
    const r = await makeRookiePick(db, l, player.id);
    if (!r.ok) throw new Error(`pick failed: ${r.error.kind}`);
    order.push(clock);
  }
}

const snapshot = async (db: Database) =>
  JSON.stringify([await db.list(ROSTER_COLLECTION), await db.list(FRANCHISE_COLLECTION), await db.list('seasons'), await db.list('nameRegistry'), await db.list('season-archives')]);


/** A solo league taken through the whole rookie draft. */
async function drafted() {
  const s = await solo();
  await generateDraftPool(s.db, s.l);
  await draftAll(s.db, s.l);
  return s;
}

/** Makes the first progressing goaltender of the first team a 30-year-old rated 31, so every die showing 6 retires it. */
async function weakenAGoalie(db: Database, seasonId: string, l: League) {
  const loaded = await load(db, l);
  if (!loaded.ok) throw new Error('load');
  const player = loaded.teams.flatMap((t) => progressionPlayers(t, loaded.teams, loaded.plan)).find((p) => p.kind === 'goalie' && loaded.teams.some((t) => t.players.some((q) => q.id === p.id)))!;
  const archive = await db.get<{ teams: { players: { id: string; age?: number; goaltending?: number }[] }[] }>(SEASON_ARCHIVE_COLLECTION, seasonId);
  if (!archive.ok || archive.value === null) throw new Error('archive');
  for (const team of archive.value.teams) for (const q of team.players) if (q.id === player.id) Object.assign(q, { age: 30, goaltending: 31 });
  await db.batch([{ type: 'put', collection: SEASON_ARCHIVE_COLLECTION, id: seasonId, value: archive.value }]);
  return player.id;
}

const sixes = () => 0.99;

describe('runProgression', () => {
  it('stages one entry per progressing player and leaves live data alone', async () => {
    const { db, l } = await drafted();
    const before = await snapshot(db);
    const loaded = await load(db, l);
    if (!loaded.ok) throw new Error('load');
    const eligible = loaded.teams.flatMap((t) => progressionPlayers(t, loaded.teams, loaded.plan).map((p) => [t.franchiseId, p.id]));
    expect((await runProgression(db, l)).ok).toBe(true);
    const plan = await planOf(db, 's-S');
    expect(plan.progression!.map((r) => [r.franchiseId, r.playerId])).toEqual(eligible);
    expect(plan.progression!.every((r) => r.roll >= 1 && r.roll <= 6)).toBe(true);
    expect(await snapshot(db)).toBe(before);
  });

  it('gives a retiring goaltender a goaltender replacement with a name nobody else has', async () => {
    const { db, l } = await drafted();
    const id = await weakenAGoalie(db, 's-S', l);
    expect((await runProgression(db, l, { rng: sixes })).ok).toBe(true);
    const plan = await planOf(db, 's-S');
    const entry = plan.progression!.find((r) => r.playerId === id)!;
    expect(entry.after).toBeUndefined();
    expect(entry.replacement).toMatchObject({ kind: 'goalie' });
    const rosters = await db.list<unknown>(ROSTER_COLLECTION);
    const onRosters = new Set<string>();
    if (rosters.ok) for (const { value } of rosters.value) if (isRoster(value)) for (const p of value.players) onRosters.add(p.name);
    const replacements = plan.progression!.flatMap((r) => (r.replacement ? [r.replacement.name] : []));
    expect(replacements.length).toBeGreaterThan(0);
    expect(new Set(replacements).size).toBe(replacements.length);
    expect(replacements.every((n) => !onRosters.has(n) && !plan.draftPool!.some((p) => p.name === n))).toBe(true);
    expect(JSON.stringify(await db.list('nameRegistry'))).not.toContain(replacements[0]);
  });

  it('rerolls everything when run again', async () => {
    const { db, l } = await drafted();
    await weakenAGoalie(db, 's-S', l);
    await runProgression(db, l, { rng: sixes });
    const first = (await planOf(db, 's-S')).progression!;
    await runProgression(db, l, { rng: () => 0 });
    const second = (await planOf(db, 's-S')).progression!;
    expect(second.map((r) => r.playerId)).toEqual(first.map((r) => r.playerId));
    expect(second.every((r) => r.roll === 1)).toBe(true);
    expect(first.every((r) => r.roll === 6)).toBe(true);
  });

  it('includes arriving teams in a linked pair', async () => {
    const { db, l, uIds } = await pair();
    await generateDraftPool(db, l);
    await draftAll(db, l);
    expect((await runProgression(db, l)).ok).toBe(true);
    const loaded = await load(db, l);
    if (!loaded.ok) throw new Error('load');
    const eligible = loaded.teams.flatMap((t) => progressionPlayers(t, loaded.teams, loaded.plan).map((p) => p.id));
    const plan = await planOf(db, 's-L');
    expect(plan.progression!.map((r) => r.playerId)).toEqual(eligible);
    expect(plan.progression!.some((r) => r.franchiseId === uIds[5])).toBe(true);
  });

  it('reports each error', async () => {
    const { db, l } = await solo();
    expect(await runProgression(db, l)).toMatchObject({ ok: false, error: { kind: 'pool-not-generated' } });
    await generateDraftPool(db, l);
    expect(await runProgression(db, l)).toMatchObject({ ok: false, error: { kind: 'rookie-draft-incomplete' } });
    await undoFreeAgentPick(db, l);
    expect(await runProgression(db, l)).toMatchObject({ ok: false, error: { kind: 'free-agency-incomplete' } });
    expect(planErrorText({ kind: 'rookie-draft-incomplete' }, make('S')).length).toBeGreaterThan(0);
  });

  it('reports no-names and writes nothing when the name pool runs out', async () => {
    const { db, l } = await drafted();
    await weakenAGoalie(db, 's-S', l);
    expect(await runProgression(db, l, { rng: sixes, pool: [] })).toMatchObject({ ok: false, error: { kind: 'no-names' } });
    expect((await planOf(db, 's-S')).progression).toBeUndefined();
  });

  it('keeps the old plan when a write fails', async () => {
    const { db, l } = await drafted();
    await runProgression(db, l);
    const before = JSON.stringify(await planOf(db, 's-S'));
    const broken = new Proxy(db, { get: (target, key) => (key === 'batch' ? async () => ({ ok: false, error: new Error('disk full') }) : (target as never)[key]) }) as Database;
    expect(await runProgression(broken, l)).toMatchObject({ ok: false, error: { kind: 'storage' } });
    expect(JSON.stringify(await planOf(db, 's-S'))).toBe(before);
  });
});

describe('another league\'s replacement names', () => {
  it('are avoided by the draft pool', async () => {
    const { db, l } = await solo();
    const names = ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE', 'FFFF', 'GGGG', 'HHHH', 'IIII', 'JJJJ', 'KKKK', 'LLLL'];
    // A second plan holding replacement draftees with those names.
    const other: OffseasonPlan = { seasonId: 's-X', leagueId: 'X', promoted: [], demoted: [] };
    await generateDraftPool(db, l, { pool: names });
    const pool = (await planOf(db, 's-S')).draftPool!;
    other.progression = pool.map((p, i) => ({ franchiseId: 'x', playerId: `x${i}`, roll: 1, replacement: p }));
    await db.batch([
      { type: 'put', collection: 'seasons', id: 's-X', value: { id: 's-X', leagueId: 'X', index: 1, status: 'offseason' } },
      { type: 'put', collection: OFFSEASON_PLAN_COLLECTION, id: 's-X', value: other },
    ]);
    await db.batch([{ type: 'put', collection: OFFSEASON_PLAN_COLLECTION, id: 's-S', value: { ...(await planOf(db, 's-S')), draftPool: undefined } }]);
    expect(await generateDraftPool(db, l, { pool: pool.map((p) => p.name) })).toMatchObject({ ok: false, error: { kind: 'no-names' } });
  });
});

describe('clearing progression', () => {
  const inject = async (db: Database, seasonId: string) => {
    const plan = await planOf(db, seasonId);
    await db.batch([{ type: 'put', collection: OFFSEASON_PLAN_COLLECTION, id: seasonId, value: { ...plan, progression: [] } }]);
  };
  const gone = async (db: Database, seasonId: string) => expect((await planOf(db, seasonId)).progression).toBeUndefined();

  it('is cleared by every earlier change', async () => {
    const { db, l, ids } = await drafted();
    await inject(db, 's-S');
    await undoRookiePick(db, l);
    await gone(db, 's-S');
    await draftAll(db, l);
    await inject(db, 's-S');
    await undoFreeAgentPick(db, l);
    await gone(db, 's-S');
    await makeFreeAgentPick(db, l, (await planOf(db, 's-S')).teamChanges![0].releasedId!);
    await inject(db, 's-S');
    expect((await planOf(db, 's-S')).progression).toEqual([]);
    await ageAndRelease(db, l, { rng: () => 0.5 });
    await gone(db, 's-S');
    const loaded = await load(db, l);
    if (!loaded.ok) throw new Error('load');
    await freeAgency(db, l);
    await inject(db, 's-S');
    const team = loaded.teams.find((t) => t.franchiseId === ids[1])!;
    await setProtection(db, l, ids[1], team.players[1].id);
    await gone(db, 's-S');
    await saveOffseasonPlan(db, l, [ids[0]], [ids[5]]);
    await inject(db, 's-S');
    await saveOffseasonPlan(db, l, [ids[0]], [ids[5]]);
    await gone(db, 's-S');
  });

  it('is cleared by regenerating the pool and by a rookie pick', async () => {
    const { db, l } = await solo();
    await generateDraftPool(db, l);
    await inject(db, 's-S');
    await generateDraftPool(db, l);
    await gone(db, 's-S');
    await inject(db, 's-S');
    const loaded = await load(db, l);
    if (!loaded.ok) throw new Error('load');
    const { plan, teams, archive, sourceArchives } = loaded;
    const clock = rookieOnTheClock(rookieDraftOrder(archive, plan, sourceArchives), teams, plan)!;
    const needs = teamNeeds(teams.find((t) => t.franchiseId === clock)!, teams, plan);
    const wanted = (await planOf(db, 's-S')).draftPool!.find((p) => (p.kind === 'goalie' ? needs.goalies : needs.standard) > 0)!;
    expect((await makeRookiePick(db, l, wanted.id)).ok).toBe(true);
    await gone(db, 's-S');
  });

  it('is cleared when arrivals are restaged', async () => {
    const { db, l } = await pair();
    await inject(db, 's-L');
    await stageArrivals(db, l);
    await gone(db, 's-L');
  });
});
