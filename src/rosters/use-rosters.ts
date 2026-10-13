import { useCallback, useEffect, useState } from 'react';

import { createLatestOnly } from '@/leagues/latest-only';
import type { League } from '@/leagues/league';
import { useDatabase } from '@/storage/storage-provider';
import type { Roster } from './roster';
import { listRosters, type RosterResult } from './roster-repository';

export type RostersState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rosters: Roster[]; unreadable: number };

function toState(result: RosterResult<{ rosters: Roster[]; unreadable: number }>): RostersState {
  if (result.ok) return { status: 'ready', ...result.value };
  const { error } = result;
  return {
    status: 'error',
    message: error.kind === 'storage' ? error.error.message : 'Could not load rosters.',
  };
}

export function useRosters(league: League) {
  const db = useDatabase();
  const [state, setState] = useState<RostersState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [latest] = useState(createLatestOnly);

  useEffect(() => {
    const isLatest = latest.begin();
    listRosters(db, league).then((result) => {
      if (isLatest()) setState(toState(result));
    });
    return () => latest.cancel();
  }, [db, league, attempt, latest]);

  /** Reloads without showing the loading state. */
  const refresh = useCallback(async () => {
    const isLatest = latest.begin();
    const result = await listRosters(db, league);
    if (isLatest()) setState(toState(result));
  }, [db, league, latest]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, refresh, retry };
}
