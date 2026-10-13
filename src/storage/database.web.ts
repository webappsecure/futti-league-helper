import { createIndexedDbDatabase, openIndexedDb } from './indexeddb-database';
import type { Database } from './types';

export async function openDatabase(): Promise<Database> {
  return createIndexedDbDatabase(await openIndexedDb(indexedDB));
}
