import { openDatabaseAsync } from 'expo-sqlite';

import { createSqliteDatabase } from './sqlite-database';
import type { Database } from './types';

export async function openDatabase(): Promise<Database> {
  return createSqliteDatabase(await openDatabaseAsync('futti.db'));
}
