import type { League } from '@/leagues/league';
import { createMemoryDatabase } from '@/storage/memory-database';
import type { FranchiseInput } from './franchise';
import {
  createFranchise,
  deleteFranchise,
  FRANCHISE_COLLECTION,
  listFranchises,
  updateFranchise,
} from './franchise-repository';

const league: League = { id: 'L1', name: 'Premier', size: 6, namingStyle: 'cityAndName', relegation: false, promotedCount: 0, demotedCount: 0 };
const otherLeague: League = { ...league, id: 'L2' };

const input = (o: Partial<FranchiseInput> = {}): FranchiseInput => ({
  city: 'Richmond',
  name: 'Greyhounds',
  primaryColor: '#3c87f7',
  secondaryColor: '#ffffff',
  initialGrade: 'B',
  ...o,
});

let counter = 0;
const nextId = () => `f-${++counter}`;

async function add(db: ReturnType<typeof createMemoryDatabase>, l: League, o: Partial<FranchiseInput> = {}) {
  const r = await createFranchise(db, l, input(o), nextId);
  if (!r.ok) throw new Error('create failed');
  return r.value;
}

describe('franchise repository', () => {
  it('creates a franchise that is then listed', async () => {
    counter = 0;
    const db = createMemoryDatabase();
    const team = await add(db, league);
    expect(team).toEqual({
      id: 'f-1',
      leagueId: 'L1',
      initialGrade: 'B',
      identities: [{ fromSeason: 1, city: 'Richmond', name: 'Greyhounds', primaryColor: '#3c87f7', secondaryColor: '#ffffff' }],
    });
    expect(await listFranchises(db, league)).toEqual({ ok: true, value: { teams: [team], unreadable: 0 } });
  });

  it('sorts by display name ignoring case and skips other leagues', async () => {
    const db = createMemoryDatabase();
    await add(db, league, { city: 'Leeds', name: 'rovers' });
    await add(db, league, { city: 'Bath', name: 'Zebras' });
    await add(db, league, { city: 'Bath', name: 'Ants' });
    await add(db, otherLeague, { name: 'Elsewhere' });
    const r = await listFranchises(db, league);
    expect(r.ok && r.value.teams.map((t) => t.identities[0].name)).toEqual(['Ants', 'Zebras', 'rovers']);
  });

  it('refuses a duplicate name on create and on edit, but allows the same city and an unchanged name', async () => {
    const db = createMemoryDatabase();
    const a = await add(db, league);
    const dup = await createFranchise(db, league, input({ name: ' greyhounds ' }));
    expect(dup).toEqual({ ok: false, error: { kind: 'validation', fields: { name: expect.any(String) } } });
    const b = await add(db, league, { name: 'Rovers' });
    expect((await updateFranchise(db, league, b.id, input({ name: 'Greyhounds' }))).ok).toBe(false);
    expect((await updateFranchise(db, league, a.id, input({ primaryColor: '#000000' }))).ok).toBe(true);
    expect((await createFranchise(db, otherLeague, input())).ok).toBe(true);
  });

  it('refuses a team when the league is full', async () => {
    const db = createMemoryDatabase();
    for (let i = 0; i < 6; i += 1) await add(db, league, { name: `T${i}` });
    expect(await createFranchise(db, league, input({ name: 'Extra' }))).toEqual({ ok: false, error: { kind: 'full' } });
  });

  it('updates identity and grade and keeps later identities', async () => {
    const db = createMemoryDatabase();
    const t = await add(db, league);
    const later = { fromSeason: 2, city: 'Leeds', name: 'Rebrand', primaryColor: '#000000', secondaryColor: '#ffffff' };
    await db.batch([
      { type: 'put', collection: FRANCHISE_COLLECTION, id: t.id, value: { ...t, identities: [...t.identities, later] } },
    ]);
    const r = await updateFranchise(db, league, t.id, input({ city: 'Bath', initialGrade: 'F' }));
    expect(r.ok && r.value.initialGrade).toBe('F');
    expect(r.ok && r.value.identities[0].city).toBe('Bath');
    expect(r.ok && r.value.identities[1]).toEqual(later);
  });

  it('fails an update of a missing id without writing, and validation writes nothing', async () => {
    const db = createMemoryDatabase();
    expect(await updateFranchise(db, league, 'nope', input())).toEqual({ ok: false, error: { kind: 'not-found' } });
    expect((await createFranchise(db, league, input({ city: '' }))).ok).toBe(false);
    const all = await db.list(FRANCHISE_COLLECTION);
    expect(all.ok && all.value).toEqual([]);
  });

  it('deletes a franchise and tolerates a missing id', async () => {
    const db = createMemoryDatabase();
    const t = await add(db, league);
    expect((await deleteFranchise(db, t.id)).ok).toBe(true);
    expect((await deleteFranchise(db, t.id)).ok).toBe(true);
    const r = await listFranchises(db, league);
    expect(r.ok && r.value.teams).toEqual([]);
  });

  it('counts an invalid stored document for the league as unreadable', async () => {
    const db = createMemoryDatabase();
    await db.batch([{ type: 'put', collection: FRANCHISE_COLLECTION, id: 'bad', value: { id: 'bad', leagueId: 'L1' } }]);
    await db.batch([{ type: 'put', collection: FRANCHISE_COLLECTION, id: 'bad2', value: { id: 'bad2', leagueId: 'L2' } }]);
    const r = await listFranchises(db, league);
    expect(r).toEqual({ ok: true, value: { teams: [], unreadable: 1 } });
  });
});

describe('team names across linked leagues', () => {
  const linked = (id: string, o: Partial<League> = {}): League => ({ ...league, id, relegation: true, promotedCount: 1, demotedCount: 1, ...o });
  const a = linked('A', { leagueBelowId: 'B' });
  const b = linked('B', { leagueAboveId: 'A', leagueBelowId: 'C' });
  const c = linked('C', { leagueAboveId: 'B' });
  const lone = linked('Z');

  it('refuses a duplicate in a linked league on create and update', async () => {
    const db = createMemoryDatabase();
    await db.batch([a, b, c, lone].map((l) => ({ type: 'put' as const, collection: 'leagues', id: l.id, value: l })));
    await add(db, b, { name: 'Rovers' });
    const created = await createFranchise(db, a, input({ name: 'rovers' }));
    expect(created).toEqual({
      ok: false,
      error: { kind: 'validation', fields: { name: 'A team with this name already exists in this league or a linked league.' } },
    });
    const other = await add(db, a, { name: 'Other' });
    expect((await updateFranchise(db, a, other.id, input({ name: 'Rovers' }))).ok).toBe(false);
    expect((await updateFranchise(db, a, other.id, input({ name: 'Other', primaryColor: '#000000' }))).ok).toBe(true);
  });

  it('checks across a three-league chain but not an unlinked league', async () => {
    const db = createMemoryDatabase();
    await db.batch([a, b, c, lone].map((l) => ({ type: 'put' as const, collection: 'leagues', id: l.id, value: l })));
    await add(db, c, { name: 'Rovers' });
    expect((await createFranchise(db, a, input({ name: 'Rovers' }))).ok).toBe(false);
    expect((await createFranchise(db, lone, input({ name: 'Rovers' }))).ok).toBe(true);
  });

  it('keeps the plain message for an unlinked league', async () => {
    const db = createMemoryDatabase();
    await add(db, league, { name: 'Rovers' });
    const r = await createFranchise(db, league, input({ name: 'Rovers' }));
    expect(r.ok === false && r.error.kind === 'validation' && r.error.fields.name).toBe(
      'A team with this name already exists in this league.',
    );
  });
});
