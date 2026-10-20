import { LEAGUE_COLLECTION, type League } from '@/leagues/league';
import { generateLeagueRosters, listRosters } from '@/rosters/roster-repository';
import { createMemoryDatabase } from '@/storage/memory-database';
import type { Franchise } from '@/teams/franchise';
import { createFranchise, listFranchises } from '@/teams/franchise-repository';
import type { Roster } from '@/rosters/roster';
import type { Season } from './season';
import { applyFinishingOrder, buildSeasonArchive, dropIndex, isSeasonArchive, reorderTeams } from './season-archive';

const league: League = { id: 'L1', name: 'Premier', size: 6, namingStyle: 'cityAndName', relegation: false, promotedCount: 0, demotedCount: 0 };
const season: Season = { id: 's-1', leagueId: 'L1', index: 1, status: 'active' };

let counter = 0;
const nextId = () => `f-${++counter}`;

async function fixture(): Promise<{ franchises: Franchise[]; rosters: Roster[] }> {
  const db = createMemoryDatabase();
  await db.batch([{ type: 'put', collection: LEAGUE_COLLECTION, id: league.id, value: league }]);
  for (let i = 0; i < league.size; i += 1) {
    const r = await createFranchise(
      db,
      league,
      { city: 'City', name: `Team${i}`, primaryColor: '#000000', secondaryColor: '#ffffff', initialGrade: 'B' },
      nextId,
    );
    if (!r.ok) throw new Error('team');
  }
  await generateLeagueRosters(db, league);
  const teams = await listFranchises(db, league);
  const rosters = await listRosters(db, league);
  if (!teams.ok || !rosters.ok) throw new Error('read');
  return { franchises: teams.value.teams, rosters: rosters.value.rosters };
}

describe('buildSeasonArchive', () => {
  it('numbers the teams in the given order and copies identity and grade', async () => {
    const { franchises, rosters } = await fixture();
    const order = franchises.map((f) => f.id).reverse();
    const built = buildSeasonArchive({ season, franchises, rosters, order });
    if (!built.ok) throw new Error('build');
    expect(built.value.teams.map((t) => t.franchiseId)).toEqual(order);
    expect(built.value.teams.map((t) => t.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(built.value.teams[0].identity).toEqual(franchises.find((f) => f.id === order[0])!.identities[0]);
    expect(built.value.teams[0].initialGrade).toBe('B');
    expect(built.value).toMatchObject({ seasonId: 's-1', leagueId: 'L1', seasonIndex: 1 });
    expect(isSeasonArchive(built.value)).toBe(true);
  });

  it.each([
    ['a duplicate', (ids: string[]) => [ids[0], ids[0], ...ids.slice(2)]],
    ['a missing id', (ids: string[]) => ids.slice(1)],
    ['an extra id', (ids: string[]) => [...ids, 'other']],
    ['an unknown id', (ids: string[]) => [...ids.slice(0, -1), 'other']],
  ])('rejects an order with %s', async (_label, bad) => {
    const { franchises, rosters } = await fixture();
    const order = bad(franchises.map((f) => f.id));
    expect(buildSeasonArchive({ season, franchises, rosters, order })).toEqual({ ok: false, error: { kind: 'invalid-order' } });
  });

  it('rejects a team without a roster', async () => {
    const { franchises, rosters } = await fixture();
    const result = buildSeasonArchive({ season, franchises, rosters: rosters.slice(1), order: franchises.map((f) => f.id) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('missing-roster');
  });

  it('rejects a team with no identity for the season', async () => {
    const { franchises, rosters } = await fixture();
    const later = franchises.map((f, i) => (i === 0 ? { ...f, identities: [{ ...f.identities[0], fromSeason: 5 }] } : f));
    const result = buildSeasonArchive({ season, franchises: later, rosters, order: later.map((f) => f.id) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('missing-identity');
  });

  it('is not changed by later edits to the roster', async () => {
    const { franchises, rosters } = await fixture();
    const built = buildSeasonArchive({ season, franchises, rosters, order: franchises.map((f) => f.id) });
    if (!built.ok) throw new Error('build');
    const before = built.value.teams[0].players[0].name;
    rosters.find((r) => r.franchiseId === built.value.teams[0].franchiseId)!.players[0].name = 'Changed';
    franchises[0].identities[0].name = 'Renamed';
    expect(built.value.teams[0].players[0].name).toBe(before);
    expect(built.value.teams[0].identity.name).not.toBe('Renamed');
  });
});

describe('applyFinishingOrder', () => {
  it('changes only the positions', async () => {
    const { franchises, rosters } = await fixture();
    const ids = franchises.map((f) => f.id);
    const built = buildSeasonArchive({ season, franchises, rosters, order: ids });
    if (!built.ok) throw new Error('build');
    const next = applyFinishingOrder(built.value, [...ids].reverse());
    if (!next.ok) throw new Error('apply');
    expect(next.value.teams.map((t) => t.franchiseId)).toEqual([...ids].reverse());
    expect(next.value.teams.map((t) => t.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(next.value.teams[0].players).toEqual(built.value.teams.find((t) => t.franchiseId === ids[5])!.players);
  });

  it('rejects an incomplete order', async () => {
    const { franchises, rosters } = await fixture();
    const ids = franchises.map((f) => f.id);
    const built = buildSeasonArchive({ season, franchises, rosters, order: ids });
    if (!built.ok) throw new Error('build');
    expect(applyFinishingOrder(built.value, ids.slice(1))).toEqual({ ok: false, error: { kind: 'invalid-order' } });
  });
});

describe('reorderTeams', () => {
  it('moves an item up and down', () => {
    expect(reorderTeams(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
    expect(reorderTeams(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('ignores moves past either end', () => {
    const order = ['a', 'b', 'c'];
    expect(reorderTeams(order, 0, -1)).toBe(order);
    expect(reorderTeams(order, 2, 3)).toBe(order);
  });
});

describe('isSeasonArchive', () => {
  it('rejects malformed documents', async () => {
    const { franchises, rosters } = await fixture();
    const built = buildSeasonArchive({ season, franchises, rosters, order: franchises.map((f) => f.id) });
    if (!built.ok) throw new Error('build');
    const good = built.value;
    expect(isSeasonArchive(null)).toBe(false);
    expect(isSeasonArchive({ ...good, seasonId: '' })).toBe(false);
    expect(isSeasonArchive({ ...good, seasonIndex: 0 })).toBe(false);
    expect(isSeasonArchive({ ...good, teams: [] })).toBe(false);
    expect(isSeasonArchive({ ...good, teams: [{ ...good.teams[0], position: 2 }, ...good.teams.slice(1)] })).toBe(false);
    expect(isSeasonArchive({ ...good, teams: [{ ...good.teams[0], players: [] }, ...good.teams.slice(1)] })).toBe(false);
    expect(isSeasonArchive({ ...good, teams: [good.teams[0], { ...good.teams[1], franchiseId: good.teams[0].franchiseId }, ...good.teams.slice(2)] })).toBe(false);
  });
});

describe('dropIndex', () => {
  it('rounds to the nearest row', () => {
    expect(dropIndex(2, 0, 60, 6)).toBe(2);
    expect(dropIndex(2, 29, 60, 6)).toBe(2);
    expect(dropIndex(2, 31, 60, 6)).toBe(3);
    expect(dropIndex(2, -91, 60, 6)).toBe(0);
  });

  it('stays inside the list', () => {
    expect(dropIndex(1, -500, 60, 6)).toBe(0);
    expect(dropIndex(4, 500, 60, 6)).toBe(5);
  });
});
