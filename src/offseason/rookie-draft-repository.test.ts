import { LEAGUE_COLLECTION, type League } from '@/leagues/league';
import { burnNames } from '@/names/name-registry';
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

describe('generateDraftPool', () => {
  it('sizes the pool to the total need plus two position players and one goaltender', async () => {
    const { db, l } = await solo();
    const before = await snapshot(db);
    const loaded = await load(db, l);
    if (!loaded.ok) throw new Error('load');
    const needs = loaded.teams.map((t) => teamNeeds(t, loaded.teams, loaded.plan));
    expect((await generateDraftPool(db, l)).ok).toBe(true);
    const pool = (await planOf(db, 's-S')).draftPool!;
    expect(pool.filter((p) => p.kind === 'standard')).toHaveLength(needs.reduce((n, x) => n + x.standard, 0) + 2);
    expect(pool.filter((p) => p.kind === 'goalie')).toHaveLength(needs.reduce((n, x) => n + x.goalies, 0) + 1);
    expect(pool.every((p) => p.age >= 18 && p.age <= 22)).toBe(true);
    expect(await snapshot(db)).toBe(before);
  });

  it('replaces an old pool, uses names that are not burned or on a roster, and never burns them', async () => {
    const { db, l } = await solo();
    await generateDraftPool(db, l);
    const first = (await planOf(db, 's-S')).draftPool!;
    await generateDraftPool(db, l);
    const second = (await planOf(db, 's-S')).draftPool!;
    expect(second.map((p) => p.id)).not.toEqual(first.map((p) => p.id));
    const rosters = await db.list<unknown>(ROSTER_COLLECTION);
    const onRosters = new Set<string>();
    if (rosters.ok) for (const { value } of rosters.value) if (isRoster(value)) for (const p of value.players) onRosters.add(p.name);
    expect(second.every((p) => !onRosters.has(p.name))).toBe(true);
    expect(new Set(second.map((p) => p.name)).size).toBe(second.length);
    const burned = await db.list('nameRegistry');
    expect(JSON.stringify(burned)).not.toContain(second[0].name);
  });

  it('skips burned names', async () => {
    const { db, l } = await solo();
    await burnNames(db, ['AAA']);
    expect(await generateDraftPool(db, l, { pool: ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III', 'JJJ', 'KKK', 'LLL', 'MMM', 'NNN', 'OOO', 'PPP'] })).toMatchObject({ ok: true });
    expect((await planOf(db, 's-S')).draftPool!.some((p) => p.name === 'AAA')).toBe(false);
  });

  it('reports no-names when the name pool runs out', async () => {
    const { db, l } = await solo();
    expect(await generateDraftPool(db, l, { pool: ['AAA'] })).toMatchObject({ ok: false, error: { kind: 'no-names' } });
    expect((await planOf(db, 's-S')).draftPool).toBeUndefined();
  });

  it('needs free agency to be finished', async () => {
    const { db, l } = await solo();
    await undoFreeAgentPick(db, l);
    expect(await generateDraftPool(db, l)).toMatchObject({ ok: false, error: { kind: 'free-agency-incomplete' } });
  });

  it('refuses to regenerate while rookie picks exist, and works again after undo', async () => {
    const { db, l } = await solo();
    await generateDraftPool(db, l);
    const loaded = await load(db, l);
    if (!loaded.ok) throw new Error('load');
    const { plan, teams, archive, sourceArchives } = loaded;
    const clock = rookieOnTheClock(rookieDraftOrder(archive, plan, sourceArchives), teams, plan)!;
    const needs = teamNeeds(teams.find((t) => t.franchiseId === clock)!, teams, plan);
    const player = plan.draftPool!.find((p) => (p.kind === 'goalie' ? needs.goalies : needs.standard) > 0)!;
    expect((await makeRookiePick(db, l, player.id)).ok).toBe(true);
    expect(await generateDraftPool(db, l)).toMatchObject({ ok: false, error: { kind: 'picks-exist' } });
    expect((await undoRookiePick(db, l)).ok).toBe(true);
    expect((await generateDraftPool(db, l)).ok).toBe(true);
  });

  it('does not reuse names from another league\'s draft pool', async () => {
    const { db, l } = await pair();
    await generateDraftPool(db, l);
    const pool = (await planOf(db, 's-L')).draftPool!;
    const other = await planOf(db, 's-U');
    await db.batch([{ type: 'put', collection: 'offseason-plans', id: 's-U', value: { ...other, draftPool: pool } }]);
    expect(await generateDraftPool(db, l, { pool: pool.map((p) => p.name) })).toMatchObject({ ok: false, error: { kind: 'no-names' } });
  });
});

describe('rookie draft', () => {
  it('runs a full solo draft in rounds, worst finisher first, and rejects the next pick', async () => {
    const { db, l, ids } = await solo();
    await generateDraftPool(db, l);
    const before = await snapshot(db);
    const loaded = await load(db, l);
    if (!loaded.ok) throw new Error('load');
    const total = new Map(loaded.teams.map((t) => {
      const n = teamNeeds(t, loaded.teams, loaded.plan);
      return [t.franchiseId, n.standard + n.goalies] as const;
    }));
    const order = await draftAll(db, l);
    expect(order[0]).toBe(ids[4]);
    for (const [id, count] of total) expect(order.filter((x) => x === id)).toHaveLength(count);
    const plan = await planOf(db, 's-S');
    expect(plan.draftPicks).toHaveLength(order.length);
    const after = await load(db, l);
    if (!after.ok) throw new Error('load');
    expect(after.teams.every((t) => teamNeeds(t, after.teams, after.plan).standard === 0 && teamNeeds(t, after.teams, after.plan).goalies === 0)).toBe(true);
    expect(await makeRookiePick(db, l, plan.draftPool![0].id)).toMatchObject({ ok: false, error: { kind: 'draft-complete' } });
    expect(await snapshot(db)).toBe(before);
  });

  it('puts a demoted arrival last in a linked pair', async () => {
    const { db, l, uIds, lIds } = await pair();
    await generateDraftPool(db, l);
    const order = await draftAll(db, l);
    const firsts = [...new Set(order)];
    const expected = [lIds[4], lIds[3], lIds[2], lIds[1], uIds[5]].filter((id) => firsts.includes(id));
    expect(firsts).toEqual(expected);
  });

  it('reports each pick error', async () => {
    const { db, l } = await solo();
    expect(await makeRookiePick(db, l, 'x')).toMatchObject({ ok: false, error: { kind: 'pool-not-generated' } });
    await generateDraftPool(db, l);
    expect(await makeRookiePick(db, l, 'nope')).toMatchObject({ ok: false, error: { kind: 'not-in-pool' } });
    expect(await undoRookiePick(db, l)).toMatchObject({ ok: false, error: { kind: 'no-picks' } });
    const loaded = await load(db, l);
    if (!loaded.ok) throw new Error('load');
    const { plan, teams, archive, sourceArchives } = loaded;
    const clock = rookieOnTheClock(rookieDraftOrder(archive, plan, sourceArchives), teams, plan)!;
    const needs = teamNeeds(teams.find((t) => t.franchiseId === clock)!, teams, plan);
    const wrong = plan.draftPool!.find((p) => (p.kind === 'goalie' ? needs.goalies : needs.standard) === 0);
    if (wrong === undefined) throw new Error('the fixture needs a draftee of a kind the team on the clock does not need');
    expect(await makeRookiePick(db, l, wrong.id)).toMatchObject({ ok: false, error: { kind: 'kind-not-needed' } });
  });

  it('needs free agency to be finished', async () => {
    const { db, l } = await solo();
    await generateDraftPool(db, l);
    await undoFreeAgentPick(db, l);
    expect(await makeRookiePick(db, l, 'x')).toMatchObject({ ok: false, error: { kind: 'free-agency-incomplete' } });
  });

  it('keeps the old plan when a write fails', async () => {
    const { db, l } = await solo();
    await generateDraftPool(db, l);
    const before = JSON.stringify(await planOf(db, 's-S'));
    const broken = new Proxy(db, { get: (target, key) => (key === 'batch' ? async () => ({ ok: false, error: new Error('disk full') }) : (target as never)[key]) }) as Database;
    expect(await generateDraftPool(broken, l)).toMatchObject({ ok: false, error: { kind: 'storage' } });
    expect(JSON.stringify(await planOf(db, 's-S'))).toBe(before);
  });
});

describe('planErrorText', () => {
  it('has text for the rookie draft errors', () => {
    for (const kind of ['free-agency-incomplete', 'pool-not-generated', 'picks-exist', 'kind-not-needed', 'draft-complete', 'not-in-pool', 'no-picks', 'no-names'] as const) {
      expect(planErrorText({ kind }, make('S')).length).toBeGreaterThan(0);
    }
  });
});

describe('clearing the draft', () => {
  const staged = async (db: Database, l: League) => {
    await generateDraftPool(db, l);
    expect((await planOf(db, `s-${l.id}`)).draftPool).toBeDefined();
  };
  const cleared = async (db: Database, id: string) => {
    const plan = await planOf(db, id);
    expect(plan.draftPool).toBeUndefined();
    expect(plan.draftPicks).toBeUndefined();
  };

  it('clears the pool and picks when a protection, aging, a free agency pick or the departures change', async () => {
    const { db, l, ids } = await solo();
    await staged(db, l);
    await undoFreeAgentPick(db, l);
    await cleared(db, 's-S');
    await freeAgency(db, l);
    await staged(db, l);
    await ageAndRelease(db, l, { rng: () => 0.5 });
    await cleared(db, 's-S');
    await freeAgency(db, l);
    await staged(db, l);
    const loaded = await load(db, l);
    if (!loaded.ok) throw new Error('load');
    const team = loaded.teams.find((t) => t.franchiseId === ids[1])!;
    await setProtection(db, l, ids[1], team.players[1].id);
    await cleared(db, 's-S');
    await protectAll(db, l, ids.slice(1, 5));
    await ageAndRelease(db, l, { rng: () => 0 });
    await freeAgency(db, l);
    await staged(db, l);
    await saveOffseasonPlan(db, l, [ids[0]], [ids[5]]);
    await cleared(db, 's-S');
  });

  it('clears the pool and picks when arrivals are restaged', async () => {
    const { db, l } = await pair();
    await staged(db, l);
    await stageArrivals(db, l);
    await cleared(db, 's-L');
  });

  it('clears a made pick when a free agency pick is made again', async () => {
    const { db, l } = await solo();
    await staged(db, l);
    await undoFreeAgentPick(db, l);
    await makeFreeAgentPick(db, l, (await planOf(db, 's-S')).teamChanges![0].releasedId!);
    await cleared(db, 's-S');
  });
});
