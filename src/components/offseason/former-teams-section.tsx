import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { createLatestOnly } from '@/leagues/latest-only';
import type { League } from '@/leagues/league';
import { addFormerTeam, listFormerTeams, removeFormerTeam, type FormerCandidate } from '@/offseason/former-teams-repository';
import { openVacancies } from '@/offseason/new-teams';
import type { OffseasonPlan, StagedFormerTeam } from '@/offseason/offseason-plan';
import { planErrorText } from '@/offseason/offseason-plan-repository';
import type { useArrivalStatus } from '@/offseason/use-arrival-status';
import { useDatabase } from '@/storage/storage-provider';
import { displayName } from '@/teams/franchise';

type Side = StagedFormerTeam['vacancy'];

const SIDE_TEXT: Record<Side, string> = {
  promoted: 'replacing a promoted team',
  demoted: 'replacing a demoted team',
};

type Candidates = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; teams: FormerCandidate[] };

interface FormerTeamsSectionProps {
  league: League;
  plan: OffseasonPlan;
  arrivals: ReturnType<typeof useArrivalStatus>;
  refresh: () => Promise<void>;
}

/** Unassigned teams that once played in this league, to fill the places linked leagues do not fill. */
export function FormerTeamsSection({ league, plan, arrivals, refresh }: FormerTeamsSectionProps) {
  const db = useDatabase();
  const [candidates, setCandidates] = useState<Candidates>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [latest] = useState(createLatestOnly);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const staged = plan.formerTeams;

  useEffect(() => {
    const isLatest = latest.begin();
    listFormerTeams(db, league, staged ?? []).then(
      (result) => {
        if (isLatest()) setCandidates(result.ok ? { status: 'ready', teams: result.value } : { status: 'error', message: result.error.message });
      },
      (e) => {
        if (isLatest()) setCandidates({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => latest.cancel();
  }, [db, league, staged, attempt, latest]);

  const run = useCallback(
    async (action: () => ReturnType<typeof removeFormerTeam>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const result = await action();
        if (result.ok) await refresh();
        else setError(planErrorText(result.error, league));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, league, refresh],
  );

  if (arrivals.state.status !== 'ready') return null;
  const open = openVacancies(plan, { hasAbove: arrivals.state.arrivals.hasAbove, hasBelow: arrivals.state.arrivals.hasBelow });
  const sides = (['promoted', 'demoted'] as const).filter((s) => open[s] > 0);
  if (candidates.status === 'ready' && candidates.teams.length === 0 && (staged ?? []).length === 0) return null;

  return (
    <ThemedView style={styles.section}>
      <ThemedText type="smallBold">Former teams</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Teams that left this league and have no league can come back to fill an open place. Their ratings are adjusted for the place and they take part in aging, free agency, the draft and progression. Nothing changes until the offseason is approved.
      </ThemedText>
      {candidates.status === 'loading' && <ThemedText type="small">Loading...</ThemedText>}
      {candidates.status === 'error' && (
        <>
          <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
            Could not load former teams. {candidates.message}
          </ThemedText>
          <ThemedView style={styles.actions}>
            <Button label="Retry" onPress={() => setAttempt((n) => n + 1)} />
          </ThemedView>
        </>
      )}
      {error !== null && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          Could not save. {error}
        </ThemedText>
      )}

      {(staged ?? []).map((team) => (
        <ThemedView key={team.franchiseId} style={styles.team}>
          <ThemedText type="smallBold">{displayName(team.identity, league.namingStyle)}</ThemedText>
          <ThemedText type="small">Returning, {SIDE_TEXT[team.vacancy]}.</ThemedText>
          <ThemedView style={styles.actions}>
            <Button label="Remove" variant="danger" disabled={busy} onPress={() => run(() => removeFormerTeam(db, league, team.franchiseId))} />
          </ThemedView>
        </ThemedView>
      ))}

      {candidates.status === 'ready' &&
        candidates.teams.map((team) => (
          <ThemedView key={team.franchiseId} style={styles.team}>
            <ThemedText type="smallBold">{displayName(team.identity, league.namingStyle)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Left after season {team.leftSeason}
            </ThemedText>
            {sides.length === 0 ? (
              <ThemedText type="small">No open places.</ThemedText>
            ) : (
              <ThemedView style={styles.actions}>
                {sides.map((side) => (
                  <Button
                    key={side}
                    label={`Bring back, ${SIDE_TEXT[side]}`}
                    disabled={busy}
                    onPress={() => run(() => addFormerTeam(db, league, team.franchiseId, side))}
                  />
                ))}
              </ThemedView>
            )}
          </ThemedView>
        ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two, paddingTop: Spacing.two },
  team: { gap: Spacing.one, paddingVertical: Spacing.two },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  error: { color: Accent.danger },
});
