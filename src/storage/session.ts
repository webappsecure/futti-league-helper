import { initStorage, type InitResult } from './init';
import { toError, type Database } from './types';

export interface StorageSession {
  result: InitResult;
  /** The open database, only when `result` is ready. */
  database: Database | null;
  /** Safe to call more than once; the database is closed at most once. */
  close(): Promise<void>;
}

export async function startStorageSession(
  open: () => Promise<Database>,
  init: (db: Database) => Promise<InitResult> = initStorage,
): Promise<StorageSession> {
  let db: Database;
  try {
    db = await open();
  } catch (e) {
    return { result: { status: 'error', error: toError(e) }, database: null, close: async () => {} };
  }

  let closing: Promise<void> | null = null;
  const close = () => (closing ??= db.close().catch(() => {}));

  let result: InitResult;
  try {
    result = await init(db);
  } catch (e) {
    result = { status: 'error', error: toError(e) };
  }

  if (result.status !== 'ready') {
    await close();
    return { result, database: null, close };
  }
  return { result, database: db, close };
}
