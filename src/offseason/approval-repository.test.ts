import { LEAGUE_COLLECTION, type League } from '@/leagues/league';
import { getBurnedNames } from '@/names/name-registry';
import { generateLeagueRosters, listRosters } from '@/rosters/roster-repository';
import { acceptLeague } from '@/seasons/accept-league';
import { finishSeason } from '@/seasons/season-archive-repository';
import { getLeagueSeason } from '@/seasons/season-repository';
import { createMemoryDatabase } from '@/storage/memory-database';
import type { Database } from '@/storage/types';
import { createFranchise, FRANCHISE_COLLECTION, listFranchises } from '@/teams/franchise-repository';
import { addNewTeam, getOffseasonPlan, saveOffseasonPlan, stageArrivals } from './offseason-plan-repository';
import { approvalFailureText, approveOffseason, prepareApproval } from './approval-repository';
import { runProgression } from './progression-repository';
import { ageAndRelease, load, makeFreeAgentPick, setProtection } from './roster-changes-repository';
import { generateDraftPool, makeRookiePick } from './rookie-draft-repository';
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
  const f = await finishSeason(db, league, ids);
  if (!f.ok) throw new Error('finish');
  return ids;
}

/** Walks one league's wizard from a saved plan (and staged arrivals) to the end of progression. */
async function walk(db: Database, l: League) {
  const loaded = await load(db, l);
  if (!loaded.ok) throw new Error(`load: ${loaded.error.kind}`);
  for (const team of loaded.teams) {
    const r = await setProtection(db, l, team.franchiseId, team.players[0].id);
    if (!r.ok) throw new Error('protect');
  }
  await ageAndRelease(db, l, { rng: () => 0 });
  for (;;) {
    const { plan } = (await load(db, l)) as Extract<Awaited<ReturnType<typeof load>>, { ok: true }>;
    const picked = new Set((plan.freeAgentPicks ?? []).map((p) => p.playerId));
    const next = (plan.teamChanges ?? []).map((c) => c.releasedId!).find((id) => !picked.has(id));
    if (next === undefined || !(await makeFreeAgentPick(db, l, next)).ok) break;
  }
  expect((await generateDraftPool(db, l)).ok).toBe(true);
  for (;;) {
    const again = await load(db, l);
    if (!again.ok) throw new Error('load');
    const { plan, teams, archive, sourceArchives } = again;
    const clock = rookieOnTheClock(rookieDraftOrder(archive, plan, sourceArchives), teams, plan);
    if (clock === null) break;
    const needs = teamNeeds(teams.find((t) => t.franchiseId === clock)!, teams, plan);
    const player = rookiePool(plan).find((p) => (p.kind === 'goalie' ? needs.goalies : needs.standard) > 0)!;
    expect((await makeRookiePick(db, l, player.id)).ok).toBe(true);
  }
  expect((await runProgression(db, l)).ok).toBe(true);
}

const rostersOf = async (db: Database, l: League) => {
  const r = await listRosters(db, l);
  if (!r.ok) throw new Error('rosters');
  return r.value.rosters;
};

const newFranchise = { city: 'Newtown', name: 'Novas', primaryColor: '#123456', secondaryColor: '#fedcba' };

async function soloReady() {
  const db = createMemoryDatabase();
  const l = make('S');
  const ids = await build(db, l);
  await saveOffseasonPlan(db, l, [ids[0]], [ids[5]]);
  await addNewTeam(db, l, newFranchise, 'promoted', { newId: () => 'new-a' });
  await addNewTeam(db, l, { ...newFranchise, name: 'Novas Two' }, 'demoted', { newId: () => 'new-b' });
  await walk(db, l);
  return { db, l, ids };
}

describe('approveOffseason for one league', () => {
  it('starts the next season, ages and rewrites rosters, creates the new teams and keeps departed teams unassigned', async () => {
    const { db, l, ids } = await soloReady();
    const before = await rostersOf(db, l);
    const result = await approveOffseason(db, l, () => 's-next');
    if (!result.ok) throw new Error(approvalFailureText(result.error));

    const season = await getLeagueSeason(db, l.id);
    expect(season).toEqual({ ok: true, value: { id: 's-next', leagueId: 'S', index: 2, status: 'active' } });
    const rosters = await rostersOf(db, l);
    expect(rosters.map((r) => r.franchiseId).sort()).toEqual([...ids.slice(1, 5), 'new-a', 'new-b'].sort());
    for (const r of rosters) {
      expect(r.players.filter((p) => p.kind === 'standard')).toHaveLength(6);
      expect(r.players.filter((p) => p.kind === 'goalie')).toHaveLength(2);
    }
    const kept = before.find((r) => r.franchiseId === ids[1])!.players[0];
    expect(rosters.find((r) => r.franchiseId === ids[1])!.players.some((p) => p.id === kept.id && p.age === kept.age + 1)).toBe(true);

    const franchises = await listFranchises(db, l);
    if (!franchises.ok) throw new Error('teams');
    expect(franchises.value.teams.map((t) => t.id).sort()).toEqual([...ids.slice(1, 5), 'new-a', 'new-b'].sort());
    expect(franchises.value.teams.find((t) => t.id === 'new-a')!.identities).toEqual([{ fromSeason: 2, ...newFranchise }]);
    const gone = await db.get<{ leagueId?: string }>(FRANCHISE_COLLECTION, ids[0]);
    expect(gone.ok && gone.value !== null && gone.value.leagueId).toBeUndefined();
    const goneRoster = await db.get<{ leagueId?: string }>('rosters', ids[5]);
    expect(goneRoster.ok && goneRoster.value !== null && 'leagueId' in goneRoster.value).toBe(false);
  });

  it('burns the new names, keeps the plan without undrafted players and ends the offseason', async () => {
    const { db, l } = await soloReady();
    const plan = await getOffseasonPlan(db, 's-S');
    if (!plan.ok || plan.value === null) throw new Error('plan');
    const pool = plan.value.draftPool!;
    const picked = new Set(plan.value.draftPicks!.map((p) => p.playerId));
    expect(pool.some((p) => !picked.has(p.id))).toBe(true);
    expect((await approveOffseason(db, l, () => 's-next')).ok).toBe(true);
    const burned = await getBurnedNames(db);
    if (!burned.ok) throw new Error('burned');
    for (const p of pool) expect(burned.value.has(p.name)).toBe(picked.has(p.id));
    const after = await getOffseasonPlan(db, 's-S');
    expect(after.ok && after.value?.draftPool?.every((p) => picked.has(p.id))).toBe(true);
    const old = await db.get<{ status: string }>('seasons', 's-S');
    expect(old.ok && old.value?.status).toBe('archived');
  });

  it('cannot run twice', async () => {
    const { db, l } = await soloReady();
    await approveOffseason(db, l, () => 's-next');
    const again = await approveOffseason(db, l, () => 's-again');
    expect(again).toMatchObject({ ok: false, error: { kind: 'not-ready' } });
    expect((await db.list('seasons')).ok && ((await db.list('seasons')) as { value: unknown[] }).value).toHaveLength(2);
  });

  it('writes nothing when a new name has been burned since staging', async () => {
    const { db, l } = await soloReady();
    const plan = await getOffseasonPlan(db, 's-S');
    if (!plan.ok || plan.value === null) throw new Error('plan');
    const name = plan.value.draftPicks!.map((p) => plan.value!.draftPool!.find((q) => q.id === p.playerId)!.name)[0];
    await db.batch([{ type: 'put', collection: 'nameRegistry', id: 'burned', value: { names: [name] } }]);
    const snapshot = async () => JSON.stringify([await db.list('rosters'), await db.list('franchises'), await db.list('seasons')]);
    const before = await snapshot();
    const result = await approveOffseason(db, l);
    expect(result).toMatchObject({ ok: false, error: { kind: 'burned-names', names: [name] } });
    expect(await snapshot()).toBe(before);
  });

  it('writes nothing when the batch fails', async () => {
    const { db, l } = await soloReady();
    const broken = new Proxy(db, { get: (target, key) => (key === 'batch' ? async () => ({ ok: false, error: new Error('disk full') }) : (target as never)[key]) }) as Database;
    expect(await approveOffseason(broken, l)).toMatchObject({ ok: false, error: { kind: 'storage' } });
    expect(await getLeagueSeason(db, 'S')).toMatchObject({ value: { index: 1, status: 'offseason' } });
  });

  it('says what is missing before the wizard is finished', async () => {
    const db = createMemoryDatabase();
    const l = make('S');
    const ids = await build(db, l);
    const none = await prepareApproval(db, l);
    expect(none).toMatchObject({ ok: false, error: { kind: 'not-ready' } });
    await saveOffseasonPlan(db, l, [ids[0]], [ids[5]]);
    const r = await prepareApproval(db, l);
    expect(r.ok === false && approvalFailureText(r.error)).toContain('protection');
  });
});

describe('approveOffseason for a league without relegation', () => {
  it('starts the next season with the same teams', async () => {
    const db = createMemoryDatabase();
    const l = make('N', { relegation: false, promotedCount: 0, demotedCount: 0 });
    const ids = await build(db, l);
    await saveOffseasonPlan(db, l, [], []);
    await walk(db, l);
    expect((await approveOffseason(db, l, () => 's-next')).ok).toBe(true);
    expect((await rostersOf(db, l)).map((r) => r.franchiseId).sort()).toEqual([...ids].sort());
    expect(await getLeagueSeason(db, 'N')).toMatchObject({ value: { index: 2, status: 'active' } });
  });
});

describe('approveOffseason for linked leagues', () => {
  async function pairReady(finishBoth = true) {
    const db = createMemoryDatabase();
    const u = make('U', { leagueBelowId: 'L' });
    const l = make('L', { leagueAboveId: 'U' });
    const uIds = await build(db, u);
    const lIds = finishBoth ? await build(db, l) : [];
    await saveOffseasonPlan(db, u, [uIds[0]], [uIds[5]]);
    if (finishBoth) await saveOffseasonPlan(db, l, [lIds[0]], [lIds[5]]);
    if (finishBoth) {
      await stageArrivals(db, l);
      await stageArrivals(db, u);
      await addNewTeam(db, u, newFranchise, 'promoted', { newId: () => 'new-u' });
      await addNewTeam(db, l, { ...newFranchise, name: 'Novas Two' }, 'demoted', { newId: () => 'new-l' });
      await walk(db, u);
      await walk(db, l);
    }
    return { db, u, l, uIds, lIds };
  }

  it('moves the teams between the leagues and advances both seasons together', async () => {
    const { db, u, l, uIds, lIds } = await pairReady();
    const result = await approveOffseason(db, l);
    if (!result.ok) throw new Error(approvalFailureText(result.error));
    expect(result.value.leagues.map((x) => x.id).sort()).toEqual(['L', 'U']);
    expect(await getLeagueSeason(db, 'U')).toMatchObject({ value: { index: 2, status: 'active' } });
    expect(await getLeagueSeason(db, 'L')).toMatchObject({ value: { index: 2, status: 'active' } });
    const upper = (await rostersOf(db, u)).map((r) => r.franchiseId).sort();
    const lower = (await rostersOf(db, l)).map((r) => r.franchiseId).sort();
    expect(upper).toEqual([...uIds.slice(1, 5), lIds[0], 'new-u'].sort());
    expect(lower).toEqual([...lIds.slice(1, 5), uIds[5], 'new-l'].sort());
    const teamsU = await listFranchises(db, u);
    const teamsL = await listFranchises(db, l);
    if (!teamsU.ok || !teamsL.ok) throw new Error('teams');
    const outside = await db.get<{ leagueId?: string }>(FRANCHISE_COLLECTION, uIds[0]);
    expect(outside.ok && outside.value !== null && outside.value.leagueId).toBeUndefined();
    expect(teamsU.value.teams.map((t) => t.id).sort()).toEqual(upper);
    expect(teamsL.value.teams.map((t) => t.id).sort()).toEqual(lower);
  });

  it('is blocked, and writes nothing, while a linked league has not finished', async () => {
    const { db, u } = await pairReady(false);
    const r = await approveOffseason(db, u);
    expect(r).toMatchObject({ ok: false, error: { kind: 'not-ready' } });
    expect(await getLeagueSeason(db, 'U')).toMatchObject({ value: { index: 1, status: 'offseason' } });
  });
});
