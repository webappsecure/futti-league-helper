import { useCallback, useEffect, useState } from 'react';

import { createLatestOnly } from '@/leagues/latest-only';
import type { League } from '@/leagues/league';
import { useDatabase } from '@/storage/storage-provider';
import type { Franchise } from './franchise';
import { listFranchises, type FranchiseResult } from './franchise-repository';

export type FranchisesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; teams: Franchise[]; unreadable: number };

function toState(result: FranchiseResult<{ teams: Franchise[]; unreadable: number }>): FranchisesState {
  if (result.ok) return { status: 'ready', ...result.value };
  const { error } = result;
  return {
    status: 'error',
    message: error.kind === 'storage' ? error.error.message : 'Could not load teams.',
  };
}

export function useFranchises(league: League) {
  const db = useDatabase();
  const [state, setState] = useState<FranchisesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [latest] = useState(createLatestOnly);

  useEffect(() => {
    const isLatest = latest.begin();
    listFranchises(db, league).then((result) => {
      if (isLatest()) setState(toState(result));
    });
    return () => latest.cancel();
  }, [db, league, attempt, latest]);

  /** Reloads without showing the loading state. */
  const refresh = useCallback(async () => {
    const isLatest = latest.begin();
    const result = await listFranchises(db, league);
    if (isLatest()) setState(toState(result));
  }, [db, league, latest]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, refresh, retry };
}
