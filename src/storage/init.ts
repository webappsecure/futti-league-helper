import { toError, type Database, type Op } from './types';

/** Returns the writes to apply; they commit together with the new schema version. */
export type Migration = (db: Database) => Promise<Op[]>;

export const migrations: Migration[] = [];

const META = { collection: 'meta', id: 'schema' } as const;

interface Meta {
  schemaVersion: number;
}

export type InitResult =
  | { status: 'ready'; schemaVersion: number }
  | { status: 'newer-version'; storedVersion: number }
  | { status: 'error'; error: Error };

function versionOp(schemaVersion: number): Op {
  return { type: 'put', ...META, value: { schemaVersion } satisfies Meta };
}

export async function initStorage(
  db: Database,
  steps: Migration[] = migrations,
): Promise<InitResult> {
  const target = 1 + steps.length;
  const meta = await db.get<Meta>(META.collection, META.id);
  if (!meta.ok) return { status: 'error', error: meta.error };

  if (meta.value === null) {
    const written = await db.batch([versionOp(target)]);
    if (!written.ok) return { status: 'error', error: written.error };
    return { status: 'ready', schemaVersion: target };
  }

  let version = meta.value.schemaVersion;
  if (!Number.isInteger(version) || version < 1) {
    return { status: 'error', error: new Error('Invalid stored schema version') };
  }
  if (version > target) return { status: 'newer-version', storedVersion: version };

  while (version < target) {
    let ops: Op[];
    try {
      ops = await steps[version - 1](db);
    } catch (e) {
      return { status: 'error', error: toError(e) };
    }
    const written = await db.batch([...ops, versionOp(version + 1)]);
    if (!written.ok) return { status: 'error', error: written.error };
    version += 1;
  }
  return { status: 'ready', schemaVersion: version };
}
