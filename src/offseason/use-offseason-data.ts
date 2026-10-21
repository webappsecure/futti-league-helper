import { useCallback, useEffect, useState } from 'react';

import { createLatestOnly } from '@/leagues/latest-only';
import { getLeague } from '@/leagues/league-repository';
import type { League } from '@/leagues/league';
import type { Season } from '@/seasons/season';
import type { SeasonArchive } from '@/seasons/season-archive';
import { useSeasonArchive } from '@/seasons/use-season-archive';
import { useDatabase } from '@/storage/storage-provider';
import type { OffseasonPlan } from './offseason-plan';
import { participatingTeams, type ParticipatingTeam } from './roster-changes';
import { useArrivalStatus } from './use-arrival-status';
import { useOffseasonPlan } from './use-offseason-plan';
import { stepStatuses, type StepStatuses } from './wizard';

export type WizardLeagueState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'missing' }
  | { status: 'ready'; league: League };

/** The league a wizard route names, loaded once. */
export function useWizardLeague(leagueId: string) {
  const db = useDatabase();
  const [state, setState] = useState<WizardLeagueState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [latest] = useState(createLatestOnly);

  useEffect(() => {
    const isLatest = latest.begin();
    getLeague(db, leagueId).then((result) => {
      if (!isLatest()) return;
      if (!result.ok) setState({ status: 'error', message: result.error.kind === 'storage' ? result.error.error.message : 'Could not read the league.' });
      else setState(result.value === null ? { status: 'missing' } : { status: 'ready', league: result.value });
    });
    return () => latest.cancel();
  }, [db, leagueId, attempt, latest]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);
  return { state, retry };
}

export type OffseasonData =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'no-archive' }
  | {
      status: 'ready';
      archive: SeasonArchive;
      plan: OffseasonPlan | null;
      teams: ParticipatingTeam[];
      statuses: StepStatuses;
    };

/** Everything the wizard steps read for a league in its offseason, with one refresh and one retry. */
export function useOffseasonData(league: League, season: Season) {
  const archive = useSeasonArchive(season.id, season.status);
  const plan = useOffseasonPlan(season.id);
  const arrivals = useArrivalStatus(league);

  const refresh = useCallback(async () => {
    await Promise.all([archive.refresh(), plan.refresh(), arrivals.refresh()]);
  }, [archive, plan, arrivals]);

  const retry = useCallback(() => {
    archive.retry();
    plan.retry();
    arrivals.retry();
  }, [archive, plan, arrivals]);

  let data: OffseasonData;
  if (archive.state.status === 'error') data = { status: 'error', message: archive.state.message };
  else if (plan.state.status === 'error') data = { status: 'error', message: plan.state.message };
  else if (arrivals.state.status === 'error') data = { status: 'error', message: arrivals.state.message };
  else if (archive.state.status === 'loading' || plan.state.status === 'loading' || arrivals.state.status === 'loading') data = { status: 'loading' };
  else if (archive.state.archive === null) data = { status: 'no-archive' };
  else {
    const teams = plan.state.plan === null ? [] : participatingTeams(archive.state.archive, plan.state.plan);
    data = {
      status: 'ready',
      archive: archive.state.archive,
      plan: plan.state.plan,
      teams,
      statuses: stepStatuses({ plan: plan.state.plan, teams, arrivals: arrivals.state.arrivals }),
    };
  }
  return { data, arrivals, refresh, retry };
}
