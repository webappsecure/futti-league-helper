import { initStorage } from './init';
import { createMemoryDatabase } from './memory-database';
import type { Database } from './types';

const version = async (db: Database) => {
  const meta = await db.get<{ schemaVersion: unknown }>('meta', 'schema');
  return meta.ok ? meta.value?.schemaVersion : undefined;
};

const seed = (db: Database, schemaVersion: unknown) =>
  db.batch([{ type: 'put', collection: 'meta', id: 'schema', value: { schemaVersion } }]);

const failingDb = (failing: 'get' | 'batch'): Database => {
  const real = createMemoryDatabase();
  const error = new Error('disk gone');
  return {
    ...real,
    get: failing === 'get' ? async () => ({ ok: false, error }) : real.get,
    batch: failing === 'batch' ? async () => ({ ok: false, error }) : real.batch,
  };
};

describe('initStorage', () => {
  it('returns an error when reading the schema version fails', async () => {
    expect(await initStorage(failingDb('get'), [])).toEqual({
      status: 'error',
      error: new Error('disk gone'),
    });
  });

  it('returns an error when writing the schema version fails', async () => {
    expect((await initStorage(failingDb('batch'), [])).status).toBe('error');
  });

  it('writes version 1 on a fresh install', async () => {
    const db = createMemoryDatabase();
    expect(await initStorage(db, [])).toEqual({ status: 'ready', schemaVersion: 1 });
    expect(await version(db)).toBe(1);
  });

  it('runs migrations in order and commits their writes with each version', async () => {
    const db = createMemoryDatabase();
    await seed(db, 1);
    const order: number[] = [];
    const result = await initStorage(db, [
      async () => {
        order.push(1);
        return [{ type: 'put', collection: 'c', id: 'a', value: 'one' }];
      },
      async () => {
        order.push(2);
        return [{ type: 'put', collection: 'c', id: 'b', value: 'two' }];
      },
    ]);
    expect(order).toEqual([1, 2]);
    expect(result).toEqual({ status: 'ready', schemaVersion: 3 });
    expect(await version(db)).toBe(3);
    expect(await db.get('c', 'a')).toEqual({ ok: true, value: 'one' });
    expect(await db.get('c', 'b')).toEqual({ ok: true, value: 'two' });
  });

  it('refuses data from a newer app and writes nothing', async () => {
    const db = createMemoryDatabase();
    await seed(db, 9);
    expect(await initStorage(db, [])).toEqual({ status: 'newer-version', storedVersion: 9 });
    expect(await version(db)).toBe(9);
  });

  it('stops at the last completed step when a migration throws', async () => {
    const db = createMemoryDatabase();
    await seed(db, 1);
    const result = await initStorage(db, [
      async () => [],
      async () => {
        throw new Error('boom');
      },
    ]);
    expect(result.status).toBe('error');
    expect(await version(db)).toBe(2);
  });

  it('keeps data and version unchanged when a migration batch cannot be stored', async () => {
    const db = createMemoryDatabase();
    await seed(db, 1);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = await initStorage(db, [
      async () => [
        { type: 'put', collection: 'c', id: 'a', value: 'ok' },
        { type: 'put', collection: 'c', id: 'bad', value: circular },
      ],
    ]);
    expect(result.status).toBe('error');
    expect(await version(db)).toBe(1);
    expect(await db.get('c', 'a')).toEqual({ ok: true, value: null });
  });

  it('reports an invalid stored version as an error', async () => {
    const db = createMemoryDatabase();
    await seed(db, 'x');
    expect((await initStorage(db, [])).status).toBe('error');
  });
});
