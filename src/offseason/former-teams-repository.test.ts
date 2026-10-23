import { limitTeamStars } from '@/rosters/control-stars';
import { LEAGUE_COLLECTION, type League } from '@/leagues/league';
import { generateLeagueRosters, listRosters } from '@/rosters/roster-repository';
import { acceptLeague } from '@/seasons/accept-league';
import { finishSeason } from '@/seasons/season-archive-repository';
import { createMemoryDatabase } from '@/storage/memory-database';
import type { Database } from '@/storage/types';
import { createFranchise, FRANCHISE_COLLECTION, listFranchises } from '@/teams/franchise-repository';
import { approveOffseason } from './approval-repository';
import { addFormerTeam, listFormerTeams, removeFormerTeam } from './former-teams-repository';
import { getLeagueSeason } from '@/seasons/season-repository';
import { addNewTeam, getOffseasonPlan, saveOffseasonPlan } from './offseason-plan-repository';
import { adjustRoster } from './rating-adjust';
import { runProgression } from './progression-repository';
import { rookieDraftOrder, rookieOnTheClock, rookiePool, teamNeeds } from './rookie-draft';
import { ageAndRelease, load, makeFreeAgentPick, setProtection } from './roster-changes-repository';
import { generateDraftPool, makeRookiePick } from './rookie-draft-repository';

const league: League = { id: 'S', name: 'League S', size: 6, namingStyle: 'cityAndName', relegation: true, promotedCount: 1, demotedCount: 1 };
let counter = 0;
const nextId = () => `t-${++counter}`;

async function build(db: Database, l: League, seasonId: string) {
  await db.batch([{ type: 'put', collection: LEAGUE_COLLECTION, id: l.id, value: l }]);
  for (let i = 0; i < l.size; i += 1) {
    const r = await createFranchise(db, l, { city: 'City', name: `Team${i}`, primaryColor: '#000000', secondaryColor: '#ffffff', initialGrade: 'B' }, nextId);
    if (!r.ok) throw new Error('team');
  }
  await generateLeagueRosters(db, l);
  if (!(await acceptLeague(db, l, () => seasonId)).ok) throw new Error('accept');
  return end(db, l);
}

async function end(db: Database, l: League) {
  const teams = await listFranchises(db, l);
  if (!teams.ok) throw new Error('teams');
  const ids = teams.value.teams.map((t) => t.id);
  if (!(await finishSeason(db, l, ids)).ok) throw new Error('finish');
  return ids;
}

/** Takes the saved plan through the whole wizard. */
async function walk(db: Database, l: League) {
  const first = await load(db, l);
  if (!first.ok) throw new Error(`load: ${first.error.kind}`);
  for (const team of first.teams) if (!(await setProtection(db, l, team.franchiseId, team.players[0].id)).ok) throw new Error('protect');
  await ageAndRelease(db, l, { rng: () => 0 });
  for (;;) {
    const loaded = await load(db, l);
    if (!loaded.ok) throw new Error('load');
    const picked = new Set((loaded.plan.freeAgentPicks ?? []).map((p) => p.playerId));
    const next = (loaded.plan.teamChanges ?? []).map((c) => c.releasedId!).find((id) => !picked.has(id));
    if (next === undefined || !(await makeFreeAgentPick(db, l, next)).ok) break;
  }
  if (!(await generateDraftPool(db, l)).ok) throw new Error('pool');
  for (;;) {
    const loaded = await load(db, l);
    if (!loaded.ok) throw new Error('load');
    const { plan, teams, archive, sourceArchives } = loaded;
    const clock = rookieOnTheClock(rookieDraftOrder(archive, plan, sourceArchives), teams, plan);
    if (clock === null) break;
    const needs = teamNeeds(teams.find((t) => t.franchiseId === clock)!, teams, plan);
    const player = rookiePool(plan).find((p) => (p.kind === 'goalie' ? needs.goalies : needs.standard) > 0)!;
    if (!(await makeRookiePick(db, l, player.id)).ok) throw new Error('rookie');
  }
  if (!(await runProgression(db, l)).ok) throw new Error('progression');
}

const NEW = { city: 'Newtown', name: 'Novas', primaryColor: '#123456', secondaryColor: '#fedcba' };

/** Season 1 ends with one promoted and one demoted team leaving unassigned; season 2 has ended and its plan is saved. */
async function secondOffseason() {
  const db = createMemoryDatabase();
  const ids = await build(db, league, 's1');
  await saveOffseasonPlan(db, league, [ids[0]], [ids[5]]);
  await addNewTeam(db, league, NEW, 'promoted', { newId: () => 'new-a' });
  await addNewTeam(db, league, { ...NEW, name: 'Novas Two' }, 'demoted', { newId: () => 'new-b' });
  await walk(db, league);
  const approved = await approveOffseason(db, league, () => 's2');
  if (!approved.ok) throw new Error('approve');
  const ids2 = await end(db, league);
  await saveOffseasonPlan(db, league, [ids2[0]], [ids2[5]]);
  return { db, ids, ids2 };
}

describe('listFormerTeams', () => {
  it('lists the teams that left this league and are unassigned, and nobody else', async () => {
    const { db, ids } = await secondOffseason();
    const list = await listFormerTeams(db, league);
    if (!list.ok) throw list.error;
    expect(list.value.map((c) => c.franchiseId).sort()).toEqual([ids[0], ids[5]].sort());
    expect(list.value.every((c) => c.leftSeason === 1 && c.players.length === 8)).toBe(true);
  });
  it('leaves out a team of another league and a staged team', async () => {
    const { db, ids } = await secondOffseason();
    const other = await listFormerTeams(db, { ...league, id: 'OTHER' });
    expect(other.ok && other.value).toEqual([]);
    const added = await addFormerTeam(db, league, ids[0], 'promoted');
    if (!added.ok) throw new Error('add');
    const rest = await listFormerTeams(db, league, added.value.formerTeams);
    expect(rest.ok && rest.value.map((c) => c.franchiseId)).toEqual([ids[5]]);
  });
  it('fails closed on an unreadable team', async () => {
    const { db, ids } = await secondOffseason();
    await db.batch([{ type: 'put', collection: FRANCHISE_COLLECTION, id: ids[0], value: { id: ids[0] } }]);
    expect((await listFormerTeams(db, league)).ok).toBe(false);
  });
});

describe('addFormerTeam', () => {
  it('stages the saved roster adjusted by the vacancy: raised when replacing a promoted team, lowered when replacing a demoted one', async () => {
    const { db, ids } = await secondOffseason();
    const list = await listFormerTeams(db, league);
    if (!list.ok) throw list.error;
    const original = (id: string) => list.value.find((c) => c.franchiseId === id)!;
    const up = await addFormerTeam(db, league, ids[0], 'promoted', { rng: () => 0.5 });
    if (!up.ok) throw new Error('add');
    expect(up.value.formerTeams![0]).toMatchObject({ franchiseId: ids[0], vacancy: 'promoted', identity: original(ids[0]).identity });
    expect(up.value.formerTeams![0].players).toEqual(limitTeamStars(adjustRoster(original(ids[0]).players, 'promoted', () => 0.5)));
    const down = await addFormerTeam(db, league, ids[5], 'demoted', { rng: () => 0.5 });
    if (!down.ok) throw new Error('add');
    expect(down.value.formerTeams![1].players).toEqual(limitTeamStars(adjustRoster(original(ids[5]).players, 'demoted', () => 0.5)));
    const saved = await getOffseasonPlan(db, down.value.seasonId);
    expect(saved.ok && saved.value?.formerTeams).toHaveLength(2);
  });
  it('refuses a full side, an unknown team and a team that is playing', async () => {
    const { db, ids, ids2 } = await secondOffseason();
    expect((await addFormerTeam(db, league, ids[0], 'promoted')).ok).toBe(true);
    expect(await addFormerTeam(db, league, ids[5], 'promoted')).toMatchObject({ ok: false, error: { kind: 'no-vacancy' } });
    expect(await addFormerTeam(db, league, 'nobody', 'demoted')).toMatchObject({ ok: false, error: { kind: 'not-former' } });
    expect(await addFormerTeam(db, league, ids2[1], 'demoted')).toMatchObject({ ok: false, error: { kind: 'not-former' } });
  });
  it('refuses a team whose name a current team now uses', async () => {
    const { db, ids, ids2 } = await secondOffseason();
    const gone = await db.get<{ identities: { name: string }[] }>(FRANCHISE_COLLECTION, ids[0]);
    const current = await db.get<{ identities: { name: string }[] }>(FRANCHISE_COLLECTION, ids2[1]);
    if (!gone.ok || !current.ok || gone.value === null || current.value === null) throw new Error('docs');
    const renamed = { ...current.value, identities: current.value.identities.map((i) => ({ ...i, name: gone.value!.identities[0].name })) };
    await db.batch([{ type: 'put', collection: FRANCHISE_COLLECTION, id: ids2[1], value: renamed }]);
    const r = await addFormerTeam(db, league, ids[0], 'promoted');
    expect(r).toMatchObject({ ok: false, error: { kind: 'validation', fields: { name: expect.any(String) } } });
  });
  it('drops protections and every later result', async () => {
    const { db, ids, ids2 } = await secondOffseason();
    const loaded = await load(db, league);
    if (!loaded.ok) throw new Error('load');
    expect((await setProtection(db, league, ids2[1], loaded.teams.find((t) => t.franchiseId === ids2[1])!.players[0].id)).ok).toBe(true);
    const r = await addFormerTeam(db, league, ids[0], 'promoted');
    if (!r.ok) throw new Error('add');
    expect(r.value.teamChanges).toBeUndefined();
  });
  it('changes nothing when the write fails, and passes storage errors on', async () => {
    const { db, ids } = await secondOffseason();
    const broken = new Proxy(db, { get: (target, key) => (key === 'batch' ? async () => ({ ok: false, error: new Error('disk full') }) : (target as never)[key]) }) as Database;
    expect(await addFormerTeam(broken, league, ids[0], 'promoted')).toMatchObject({ ok: false, error: { kind: 'storage' } });
    const plan = await getOffseasonPlan(db, 's2');
    expect(plan.ok && plan.value?.formerTeams).toBeUndefined();
  });
});

describe('removeFormerTeam', () => {
  it('frees the place again', async () => {
    const { db, ids } = await secondOffseason();
    await addFormerTeam(db, league, ids[0], 'promoted');
    const r = await removeFormerTeam(db, league, ids[0]);
    expect(r.ok && r.value.formerTeams).toBeUndefined();
    expect(await removeFormerTeam(db, league, ids[0])).toMatchObject({ ok: false, error: { kind: 'not-found' } });
    expect((await addFormerTeam(db, league, ids[0], 'promoted')).ok).toBe(true);
  });
});

describe('approving an offseason with returning teams', () => {
  it('moves both back into the league with their adjusted rosters and ends their unassigned time', async () => {
    const { db, ids, ids2 } = await secondOffseason();
    const staged = (await addFormerTeam(db, league, ids[0], 'promoted', { rng: () => 0.5 }));
    if (!staged.ok) throw new Error('add');
    expect((await addFormerTeam(db, league, ids[5], 'demoted', { rng: () => 0.5 })).ok).toBe(true);
    await walk(db, league);
    const approved = await approveOffseason(db, league, () => 's3');
    if (!approved.ok) throw new Error(JSON.stringify(approved.error));
    expect(approved.value.approval.summaries[0]).toMatchObject({ teams: 6, formerTeams: 2 });
    expect(await getLeagueSeason(db, 'S')).toMatchObject({ value: { id: 's3', index: 3, status: 'active' } });
    const franchises = await listFranchises(db, league);
    if (!franchises.ok) throw new Error('teams');
    const inLeague = franchises.value.teams.map((t) => t.id).sort();
    expect(inLeague).toEqual([...ids2.slice(1, 5), ids[0], ids[5]].sort());
    const rosters = await listRosters(db, league);
    if (!rosters.ok) throw new Error('rosters');
    const back = rosters.value.rosters.find((r) => r.franchiseId === ids[0])!;
    expect(back.leagueId).toBe('S');
    const returned = staged.value.formerTeams![0].players;
    // The roster that returned is the staged one, a year older, with progression and the drafts applied.
    expect(back.players.filter((p) => p.kind === 'standard')).toHaveLength(6);
    expect(returned).toHaveLength(8);
    const left = await listFormerTeams(db, league);
    expect(left.ok && left.value.map((c) => c.franchiseId).sort()).toEqual([ids2[0], ids2[5]].sort());
  });
});
