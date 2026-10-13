import { initStorage } from './init';
import { createMemoryDatabase } from './memory-database';
import type { Database } from './types';

const version = async (db: Database) => {
  const meta = await db.get<{ schemaVersion: unknown }>('meta', 'schema');
  return meta.ok ? meta.value?.schemaVersion : undefined;
};

const seed = (db: Database, schemaVersion: unknown) =>
  db.batch([{ type: 'put', collection: 'meta', id: 'schema', value: { schemaVersion } }]);

describe('initStorage', () => {
  it('writes version 1 on a fresh install', async () => {
    const db = createMemoryDatabase();
    expect(await initStorage(db, [])).toEqual({ status: 'ready', schemaVersion: 1 });
    expect(await version(db)).toBe(1);
  });

  it('runs migrations in order and records each version', async () => {
    const db = createMemoryDatabase();
    await seed(db, 1);
    const order: number[] = [];
    const result = await initStorage(db, [
      async () => void order.push(1),
      async () => void order.push(2),
    ]);
    expect(order).toEqual([1, 2]);
    expect(result).toEqual({ status: 'ready', schemaVersion: 3 });
    expect(await version(db)).toBe(3);
  });

  it('refuses data from a newer app and writes nothing', async () => {
    const db = createMemoryDatabase();
    await seed(db, 9);
    expect(await initStorage(db, [])).toEqual({ status: 'newer-version', storedVersion: 9 });
    expect(await version(db)).toBe(9);
  });

  it('stops at the last completed step when a migration fails', async () => {
    const db = createMemoryDatabase();
    await seed(db, 1);
    const result = await initStorage(db, [
      async () => {},
      async () => {
        throw new Error('boom');
      },
    ]);
    expect(result.status).toBe('error');
    expect(await version(db)).toBe(2);
  });

  it('reports an invalid stored version as an error', async () => {
    const db = createMemoryDatabase();
    await seed(db, 'x');
    expect((await initStorage(db, [])).status).toBe('error');
  });
});
