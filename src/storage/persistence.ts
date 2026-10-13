export type PersistenceStatus = 'persistent' | 'not-persistent' | 'unsupported';

interface StorageManagerLike {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}

function defaultManager(): StorageManagerLike | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.storage;
}

export async function requestPersistentStorage(
  manager: StorageManagerLike | undefined = defaultManager(),
): Promise<PersistenceStatus> {
  if (!manager?.persist || !manager.persisted) return 'unsupported';
  try {
    if (await manager.persisted()) return 'persistent';
    return (await manager.persist()) ? 'persistent' : 'not-persistent';
  } catch {
    return 'not-persistent';
  }
}
