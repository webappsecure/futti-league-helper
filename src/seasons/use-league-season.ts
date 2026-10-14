import { useCallback, useEffect, useState } from 'react';

import { createLatestOnly } from '@/leagues/latest-only';
import type { League } from '@/leagues/league';
import { useDatabase } from '@/storage/storage-provider';
import type { Result } from '@/storage/types';
import type { Season } from './season';
import { getLeagueSeason } from './season-repository';

export type LeagueSeasonState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; season: Season | null };

function toState(result: Result<Season | null>): LeagueSeasonState {
  return result.ok ? { status: 'ready', season: result.value } : { status: 'error', message: result.error.message };
}

export function useLeagueSeason(league: League) {
  const db = useDatabase();
  const [state, setState] = useState<LeagueSeasonState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [latest] = useState(createLatestOnly);

  useEffect(() => {
    const isLatest = latest.begin();
    getLeagueSeason(db, league.id).then((result) => {
      if (isLatest()) setState(toState(result));
    });
    return () => latest.cancel();
  }, [db, league.id, attempt, latest]);

  /** Reloads without showing the loading state. */
  const refresh = useCallback(async () => {
    const isLatest = latest.begin();
    const result = await getLeagueSeason(db, league.id);
    if (isLatest()) setState(toState(result));
  }, [db, league.id, latest]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, refresh, retry };
}
