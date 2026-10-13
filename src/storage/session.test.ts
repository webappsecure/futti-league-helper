import { createMemoryDatabase } from './memory-database';
import { startStorageSession } from './session';
import type { Database } from './types';

function countingDb() {
  const state = { closes: 0 };
  const db: Database = {
    ...createMemoryDatabase(),
    close: async () => {
      state.closes += 1;
    },
  };
  return { db, state };
}

describe('startStorageSession', () => {
  it('returns the open database when init is ready and closes it on request', async () => {
    const { db, state } = countingDb();
    const session = await startStorageSession(async () => db);
    expect(session.result).toEqual({ status: 'ready', schemaVersion: 1 });
    expect(session.database).toBe(db);
    expect(state.closes).toBe(0);
    await session.close();
    expect(state.closes).toBe(1);
  });

  it('closes the database and returns none when init reports an error', async () => {
    const { db, state } = countingDb();
    const session = await startStorageSession(
      async () => db,
      async () => ({ status: 'error', error: new Error('bad') }),
    );
    expect(session.result.status).toBe('error');
    expect(session.database).toBeNull();
    expect(state.closes).toBe(1);
    await session.close();
    expect(state.closes).toBe(1);
  });

  it('closes the database when the stored data is from a newer version', async () => {
    const { db, state } = countingDb();
    const session = await startStorageSession(
      async () => db,
      async () => ({ status: 'newer-version', storedVersion: 9 }),
    );
    expect(session.result).toEqual({ status: 'newer-version', storedVersion: 9 });
    expect(session.database).toBeNull();
    expect(state.closes).toBe(1);
  });

  it('closes the database when init throws', async () => {
    const { db, state } = countingDb();
    const session = await startStorageSession(
      async () => db,
      async () => {
        throw new Error('boom');
      },
    );
    expect(session.result.status).toBe('error');
    expect(state.closes).toBe(1);
  });

  it('returns an error without a database when open fails', async () => {
    const init = jest.fn();
    const session = await startStorageSession(async () => {
      throw new Error('cannot open');
    }, init);
    expect(session.result).toEqual({ status: 'error', error: new Error('cannot open') });
    expect(session.database).toBeNull();
    expect(init).not.toHaveBeenCalled();
    await expect(session.close()).resolves.toBeUndefined();
  });

  it('closes once when close is called repeatedly, including right after it resolves', async () => {
    const { db, state } = countingDb();
    const session = await startStorageSession(async () => db);
    await Promise.all([session.close(), session.close()]);
    await session.close();
    expect(state.closes).toBe(1);
  });

  it('ignores a failure while closing', async () => {
    const { db } = countingDb();
    const failing: Database = {
      ...db,
      close: async () => {
        throw new Error('already closed');
      },
    };
    const session = await startStorageSession(async () => failing);
    await expect(session.close()).resolves.toBeUndefined();
  });
});
