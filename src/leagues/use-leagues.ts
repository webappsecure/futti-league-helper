import { useCallback, useEffect, useState } from 'react';

import type { League } from './league';
import { createLatestOnly } from './latest-only';
import { listLeagues, type LeagueResult } from './league-repository';
import { useDatabase } from '@/storage/storage-provider';

export type LeaguesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; leagues: League[]; unreadable: number };

function toState(result: LeagueResult<{ leagues: League[]; unreadable: number }>): LeaguesState {
  if (result.ok) return { status: 'ready', ...result.value };
  const { error } = result;
  return {
    status: 'error',
    message: error.kind === 'storage' ? error.error.message : 'Could not load leagues.',
  };
}

export function useLeagues() {
  const db = useDatabase();
  const [state, setState] = useState<LeaguesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [latest] = useState(createLatestOnly);

  useEffect(() => {
    const isLatest = latest.begin();
    listLeagues(db).then((result) => {
      if (isLatest()) setState(toState(result));
    });
    return () => latest.cancel();
  }, [db, attempt, latest]);

  /** Reloads without showing the loading state. */
  const refresh = useCallback(async () => {
    const isLatest = latest.begin();
    const result = await listLeagues(db);
    if (isLatest()) setState(toState(result));
  }, [db, latest]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, refresh, retry };
}
