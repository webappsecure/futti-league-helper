import { createMemoryDatabase } from '@/storage/memory-database';
import { burnNames, burnNamesOp, getBurnedNames, NAME_REGISTRY_COLLECTION } from './name-registry';

async function burned(db: ReturnType<typeof createMemoryDatabase>) {
  const r = await getBurnedNames(db);
  if (!r.ok) throw r.error;
  return [...r.value];
}

describe('burned-name registry', () => {
  it('is empty before anything is burned', async () => {
    expect(await burned(createMemoryDatabase())).toEqual([]);
  });

  it('stores burned names and reads them back', async () => {
    const db = createMemoryDatabase();
    expect((await burnNames(db, ['SMITH', 'ABEL'])).ok).toBe(true);
    expect(await burned(db)).toEqual(['ABEL', 'SMITH']);
  });

  it('treats accent and case variants as the same name', async () => {
    const db = createMemoryDatabase();
    await burnNames(db, ['Martín']);
    await burnNames(db, ['MARTIN']);
    expect(await burned(db)).toEqual(['MARTIN']);
  });

  it('stores a name typed with a trailing apostrophe in its normalized form', async () => {
    const db = createMemoryDatabase();
    expect((await burnNames(db, ["SMITH '"])).ok).toBe(true);
    expect(await burned(db)).toEqual(['SMITH']);
  });

  it('accumulates across burns and ignores repeats', async () => {
    const db = createMemoryDatabase();
    await burnNames(db, ['ABEL']);
    await burnNames(db, ['BAKER', 'ABEL']);
    expect(await burned(db)).toEqual(['ABEL', 'BAKER']);
  });

  it('returns an error for a damaged document and writes nothing', async () => {
    const db = createMemoryDatabase();
    await db.batch([{ type: 'put', collection: NAME_REGISTRY_COLLECTION, id: 'burned', value: { names: ['martín', 5] } }]);
    expect((await getBurnedNames(db)).ok).toBe(false);
    expect((await burnNames(db, ['ABEL'])).ok).toBe(false);
    const doc = await db.get(NAME_REGISTRY_COLLECTION, 'burned');
    expect(doc).toEqual({ ok: true, value: { names: ['martín', 5] } });
  });

  it('refuses an invalid name without writing', async () => {
    const db = createMemoryDatabase();
    await expect(burnNames(db, ['ABEL', 'SMITH2'])).rejects.toThrow(RangeError);
    expect(await burned(db)).toEqual([]);
  });

  it('composes with another write in one batch', async () => {
    const db = createMemoryDatabase();
    const op = burnNamesOp(new Set(), ['ABEL']);
    const r = await db.batch([{ type: 'put', collection: 'other', id: 'x', value: 1 }, op]);
    expect(r.ok).toBe(true);
    expect(await burned(db)).toEqual(['ABEL']);
    expect(await db.get('other', 'x')).toEqual({ ok: true, value: 1 });
  });
});
