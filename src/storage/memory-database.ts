import { fail, ok, prepareOps, type Database, type Op, type Result } from './types';

export function createMemoryDatabase(): Database {
  const docs = new Map<string, Map<string, string>>();

  return {
    async get<T>(collection: string, id: string): Promise<Result<T | null>> {
      try {
        const json = docs.get(collection)?.get(id);
        return ok(json === undefined ? null : (JSON.parse(json) as T));
      } catch (e) {
        return fail(e);
      }
    },

    async list<T>(collection: string): Promise<Result<{ id: string; value: T }[]>> {
      try {
        const entries = [...(docs.get(collection) ?? [])].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return ok(entries.map(([id, json]) => ({ id, value: JSON.parse(json) as T })));
      } catch (e) {
        return fail(e);
      }
    },

    async batch(ops: Op[]): Promise<Result<void>> {
      try {
        for (const op of prepareOps(ops)) {
          if (op.type === 'put') {
            if (!docs.has(op.collection)) docs.set(op.collection, new Map());
            docs.get(op.collection)!.set(op.id, op.json);
          } else {
            docs.get(op.collection)?.delete(op.id);
          }
        }
        return ok(undefined);
      } catch (e) {
        return fail(e);
      }
    },

    async close() {},
  };
}
