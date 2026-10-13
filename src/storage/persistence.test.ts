import { requestPersistentStorage } from './persistence';

describe('requestPersistentStorage', () => {
  it('is unsupported without a storage manager', async () => {
    expect(await requestPersistentStorage(undefined)).toBe('unsupported');
    expect(await requestPersistentStorage({})).toBe('unsupported');
  });

  it('does not re-request when already persistent', async () => {
    const persist = jest.fn(async () => true);
    const status = await requestPersistentStorage({ persisted: async () => true, persist });
    expect(status).toBe('persistent');
    expect(persist).not.toHaveBeenCalled();
  });

  it('requests persistence and reports the grant', async () => {
    const status = await requestPersistentStorage({
      persisted: async () => false,
      persist: async () => true,
    });
    expect(status).toBe('persistent');
  });

  it('reports a denial', async () => {
    const status = await requestPersistentStorage({
      persisted: async () => false,
      persist: async () => false,
    });
    expect(status).toBe('not-persistent');
  });

  it('treats a thrown error as not persistent', async () => {
    const status = await requestPersistentStorage({
      persisted: async () => {
        throw new Error('x');
      },
      persist: async () => true,
    });
    expect(status).toBe('not-persistent');
  });
});
