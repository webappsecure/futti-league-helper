import { toError, type Database, type Op } from './types';

export type Migration = (db: Database) => Promise<void>;

export const migrations: Migration[] = [];

const META = { collection: 'meta', id: 'schema' } as const;

interface Meta {
  schemaVersion: number;
}

export type InitResult =
  | { status: 'ready'; schemaVersion: number }
  | { status: 'newer-version'; storedVersion: number }
  | { status: 'error'; error: Error };

function writeVersion(db: Database, schemaVersion: number) {
  const op: Op = { type: 'put', ...META, value: { schemaVersion } satisfies Meta };
  return db.batch([op]);
}

export async function initStorage(
  db: Database,
  steps: Migration[] = migrations,
): Promise<InitResult> {
  const target = 1 + steps.length;
  const meta = await db.get<Meta>(META.collection, META.id);
  if (!meta.ok) return { status: 'error', error: meta.error };

  if (meta.value === null) {
    const written = await writeVersion(db, target);
    if (!written.ok) return { status: 'error', error: written.error };
    return { status: 'ready', schemaVersion: target };
  }

  let version = meta.value.schemaVersion;
  if (!Number.isInteger(version) || version < 1) {
    return { status: 'error', error: new Error('Invalid stored schema version') };
  }
  if (version > target) return { status: 'newer-version', storedVersion: version };

  while (version < target) {
    try {
      await steps[version - 1](db);
    } catch (e) {
      return { status: 'error', error: toError(e) };
    }
    version += 1;
    const written = await writeVersion(db, version);
    if (!written.ok) return { status: 'error', error: written.error };
  }
  return { status: 'ready', schemaVersion: version };
}
