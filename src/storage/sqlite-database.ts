import type { SQLiteDatabase } from 'expo-sqlite';

import { createSerialQueue } from './serial-queue';
import { fail, ok, prepareOps, type Database, type Op, type Result } from './types';

interface Row {
  id: string;
  json: string;
}

export async function createSqliteDatabase(db: SQLiteDatabase): Promise<Database> {
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS docs (collection TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (collection, id))',
  );

  const enqueue = createSerialQueue();

  return {
    async get<T>(collection: string, id: string): Promise<Result<T | null>> {
      try {
        const row = await db.getFirstAsync<Row>(
          'SELECT id, json FROM docs WHERE collection = ? AND id = ?',
          collection,
          id,
        );
        return ok(row === null ? null : (JSON.parse(row.json) as T));
      } catch (e) {
        return fail(e);
      }
    },

    async list<T>(collection: string): Promise<Result<{ id: string; value: T }[]>> {
      try {
        const rows = await db.getAllAsync<Row>(
          'SELECT id, json FROM docs WHERE collection = ? ORDER BY id',
          collection,
        );
        return ok(rows.map((row) => ({ id: row.id, value: JSON.parse(row.json) as T })));
      } catch (e) {
        return fail(e);
      }
    },

    async batch(ops: Op[]): Promise<Result<void>> {
      try {
        const prepared = prepareOps(ops);
        // Exclusive transactions use their own connection, so no other query can join this one.
        await enqueue(() =>
          db.withExclusiveTransactionAsync(async (txn) => {
            for (const op of prepared) {
              if (op.type === 'put') {
                await txn.runAsync(
                  'INSERT OR REPLACE INTO docs (collection, id, json) VALUES (?, ?, ?)',
                  op.collection,
                  op.id,
                  op.json,
                );
              } else {
                await txn.runAsync(
                  'DELETE FROM docs WHERE collection = ? AND id = ?',
                  op.collection,
                  op.id,
                );
              }
            }
          }),
        );
        return ok(undefined);
      } catch (e) {
        return fail(e);
      }
    },

    async close() {
      await db.closeAsync();
    },
  };
}
