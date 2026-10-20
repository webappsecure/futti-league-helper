import { useCallback, useEffect, useState } from 'react';

import { createLatestOnly } from '@/leagues/latest-only';
import { useDatabase } from '@/storage/storage-provider';
import type { Result } from '@/storage/types';
import type { SeasonArchive } from './season-archive';
import { getSeasonArchive } from './season-archive-repository';

export type SeasonArchiveState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; archive: SeasonArchive | null };

function toState(result: Result<SeasonArchive | null>): SeasonArchiveState {
  return result.ok ? { status: 'ready', archive: result.value } : { status: 'error', message: result.error.message };
}

/** The archive for a season; `archive` is null until the season has ended. Reloads when `status` changes. */
export function useSeasonArchive(seasonId: string, status: string) {
  const db = useDatabase();
  const [state, setState] = useState<SeasonArchiveState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [latest] = useState(createLatestOnly);

  useEffect(() => {
    const isLatest = latest.begin();
    getSeasonArchive(db, seasonId).then((result) => {
      if (isLatest()) setState(toState(result));
    });
    return () => latest.cancel();
  }, [db, seasonId, status, attempt, latest]);

  /** Reloads without showing the loading state. */
  const refresh = useCallback(async () => {
    const isLatest = latest.begin();
    const result = await getSeasonArchive(db, seasonId);
    if (isLatest()) setState(toState(result));
  }, [db, seasonId, latest]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, refresh, retry };
}
