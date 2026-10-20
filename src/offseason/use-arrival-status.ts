import { useCallback, useEffect, useState } from 'react';

import { createLatestOnly } from '@/leagues/latest-only';
import { useDatabase } from '@/storage/storage-provider';
import type { Result } from '@/storage/types';
import type { League } from '@/leagues/league';
import { getArrivalStatus, type ArrivalStatus } from './offseason-plan-repository';

export type ArrivalState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; arrivals: ArrivalStatus };

function toState(result: Result<ArrivalStatus>): ArrivalState {
  return result.ok ? { status: 'ready', arrivals: result.value } : { status: 'error', message: result.error.message };
}

/** Who should arrive in this league, what is staged and what blocks staging. */
export function useArrivalStatus(league: League) {
  const db = useDatabase();
  const [state, setState] = useState<ArrivalState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [latest] = useState(createLatestOnly);

  useEffect(() => {
    const isLatest = latest.begin();
    getArrivalStatus(db, league).then((result) => {
      if (isLatest()) setState(toState(result));
    });
    return () => latest.cancel();
  }, [db, league, attempt, latest]);

  /** Reloads without showing the loading state. */
  const refresh = useCallback(async () => {
    const isLatest = latest.begin();
    const result = await getArrivalStatus(db, league);
    if (isLatest()) setState(toState(result));
  }, [db, league, latest]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, refresh, retry };
}
