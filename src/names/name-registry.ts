import { fail, ok, type Database, type Op, type Result } from '@/storage/types';
import { normalizeName } from './normalize-name';

export const NAME_REGISTRY_COLLECTION = 'nameRegistry';
const BURNED_ID = 'burned';

interface BurnedDocument {
  names: string[];
}

function isBurnedDocument(value: unknown): value is BurnedDocument {
  if (typeof value !== 'object' || value === null) return false;
  const names = (value as { names?: unknown }).names;
  return Array.isArray(names) && names.every((n) => typeof n === 'string' && normalizeName(n) === n);
}

/** Every burned name. A missing document is an empty registry; a damaged one is an error, never empty. */
export async function getBurnedNames(db: Database): Promise<Result<Set<string>>> {
  const stored = await db.get<unknown>(NAME_REGISTRY_COLLECTION, BURNED_ID);
  if (!stored.ok) return stored;
  if (stored.value === null) return ok(new Set());
  if (!isBurnedDocument(stored.value)) return fail(new Error('The burned-name registry could not be read'));
  return ok(new Set(stored.value.names));
}

/** The write that burns `names` on top of `burned`; compose it into another batch to burn atomically. */
export function burnNamesOp(burned: ReadonlySet<string>, names: readonly string[]): Op {
  const all = new Set(burned);
  for (const raw of names) {
    const name = normalizeName(raw);
    if (name === null) throw new RangeError(`Not a valid name: ${raw}`);
    all.add(name);
  }
  const value: BurnedDocument = { names: [...all].sort() };
  return { type: 'put', collection: NAME_REGISTRY_COLLECTION, id: BURNED_ID, value };
}

/** Burns names permanently. Burning a name that is already burned changes nothing. */
export async function burnNames(db: Database, names: readonly string[]): Promise<Result<void>> {
  const burned = await getBurnedNames(db);
  if (!burned.ok) return burned;
  return db.batch([burnNamesOp(burned.value, names)]);
}
