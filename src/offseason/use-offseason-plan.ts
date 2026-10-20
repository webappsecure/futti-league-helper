import { useCallback, useEffect, useState } from 'react';

import { createLatestOnly } from '@/leagues/latest-only';
import { useDatabase } from '@/storage/storage-provider';
import type { Result } from '@/storage/types';
import type { OffseasonPlan } from './offseason-plan';
import { getOffseasonPlan } from './offseason-plan-repository';

export type OffseasonPlanState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; plan: OffseasonPlan | null };

function toState(result: Result<OffseasonPlan | null>): OffseasonPlanState {
  return result.ok ? { status: 'ready', plan: result.value } : { status: 'error', message: result.error.message };
}

/** The saved plan for a season; `plan` is null until one is saved. */
export function useOffseasonPlan(seasonId: string) {
  const db = useDatabase();
  const [state, setState] = useState<OffseasonPlanState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [latest] = useState(createLatestOnly);

  useEffect(() => {
    const isLatest = latest.begin();
    getOffseasonPlan(db, seasonId).then((result) => {
      if (isLatest()) setState(toState(result));
    });
    return () => latest.cancel();
  }, [db, seasonId, attempt, latest]);

  /** Reloads without showing the loading state. */
  const refresh = useCallback(async () => {
    const isLatest = latest.begin();
    const result = await getOffseasonPlan(db, seasonId);
    if (isLatest()) setState(toState(result));
  }, [db, seasonId, latest]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, refresh, retry };
}
