import { fail, ok, prepareOps, type Database, type Op, type Result } from './types';

const STORE = 'docs';

interface Row {
  collection: string;
  id: string;
  json: string;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openIndexedDb(factory: IDBFactory, name = 'futti'): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: ['collection', 'id'] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database upgrade is blocked by another tab'));
  });
}

export function createIndexedDbDatabase(db: IDBDatabase): Database {
  return {
    async get<T>(collection: string, id: string): Promise<Result<T | null>> {
      try {
        const row = await request<Row | undefined>(
          db.transaction(STORE, 'readonly').objectStore(STORE).get([collection, id]),
        );
        return ok(row === undefined ? null : (JSON.parse(row.json) as T));
      } catch (e) {
        return fail(e);
      }
    },

    async list<T>(collection: string): Promise<Result<{ id: string; value: T }[]>> {
      try {
        const rows = await request<Row[]>(
          db
            .transaction(STORE, 'readonly')
            .objectStore(STORE)
            .getAll(IDBKeyRange.bound([collection, ''], [collection, []])),
        );
        return ok(rows.map((row) => ({ id: row.id, value: JSON.parse(row.json) as T })));
      } catch (e) {
        return fail(e);
      }
    },

    async batch(ops: Op[]): Promise<Result<void>> {
      try {
        const prepared = prepareOps(ops);
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          const store = tx.objectStore(STORE);
          for (const op of prepared) {
            if (op.type === 'put') {
              store.put({ collection: op.collection, id: op.id, json: op.json } satisfies Row);
            } else {
              store.delete([op.collection, op.id]);
            }
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
        });
        return ok(undefined);
      } catch (e) {
        return fail(e);
      }
    },
  };
}
