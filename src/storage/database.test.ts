import 'fake-indexeddb/auto';

import { createIndexedDbDatabase, openIndexedDb } from './indexeddb-database';
import { createMemoryDatabase } from './memory-database';
import type { Database } from './types';

let counter = 0;

const backends: [string, () => Promise<Database>][] = [
  ['memory', async () => createMemoryDatabase()],
  [
    'indexeddb',
    async () => createIndexedDbDatabase(await openIndexedDb(indexedDB, `test-${counter++}`)),
  ],
];

describe.each(backends)('%s database', (_name, make) => {
  let db: Database;

  beforeEach(async () => {
    db = await make();
  });

  it('round trips a document', async () => {
    await db.batch([{ type: 'put', collection: 'c', id: 'a', value: { n: 1, tags: ['x'] } }]);
    expect(await db.get('c', 'a')).toEqual({ ok: true, value: { n: 1, tags: ['x'] } });
  });

  it('returns null for a missing document', async () => {
    expect(await db.get('c', 'nope')).toEqual({ ok: true, value: null });
  });

  it('replaces and deletes', async () => {
    await db.batch([{ type: 'put', collection: 'c', id: 'a', value: 1 }]);
    await db.batch([{ type: 'put', collection: 'c', id: 'a', value: 2 }]);
    expect(await db.get('c', 'a')).toEqual({ ok: true, value: 2 });
    await db.batch([{ type: 'delete', collection: 'c', id: 'a' }]);
    expect(await db.get('c', 'a')).toEqual({ ok: true, value: null });
  });

  it('lists one collection ordered by id', async () => {
    await db.batch([
      { type: 'put', collection: 'c', id: 'b', value: 'B' },
      { type: 'put', collection: 'c', id: 'a', value: 'A' },
      { type: 'put', collection: 'other', id: 'z', value: 'Z' },
    ]);
    expect(await db.list('c')).toEqual({
      ok: true,
      value: [
        { id: 'a', value: 'A' },
        { id: 'b', value: 'B' },
      ],
    });
  });

  it('applies a batch across collections together', async () => {
    await db.batch([
      { type: 'put', collection: 'c1', id: 'a', value: 1 },
      { type: 'put', collection: 'c2', id: 'a', value: 2 },
    ]);
    expect(await db.get('c1', 'a')).toEqual({ ok: true, value: 1 });
    expect(await db.get('c2', 'a')).toEqual({ ok: true, value: 2 });
  });

  it('applies none of a batch when one value cannot be stored', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = await db.batch([
      { type: 'put', collection: 'c', id: 'good', value: 1 },
      { type: 'put', collection: 'c', id: 'bad', value: circular },
    ]);
    expect(result.ok).toBe(false);
    expect(await db.get('c', 'good')).toEqual({ ok: true, value: null });
  });
});
