import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import { blockedText, planErrorText, stageArrivals, type ArrivalStatus } from '@/offseason/offseason-plan-repository';
import type { useArrivalStatus } from '@/offseason/use-arrival-status';
import { playerLine } from '@/rosters/player-line';
import { useDatabase } from '@/storage/storage-provider';
import { displayName } from '@/teams/franchise';

type ArrivalHook = ReturnType<typeof useArrivalStatus>;

interface ArrivalsSectionProps {
  league: League;
  /** True once this league's own departures plan has been saved. */
  hasPlan: boolean;
  arrivals: ArrivalHook;
}

/** Teams arriving from the linked leagues. Renders nothing for a league with no linked neighbor. */
export function ArrivalsSection({ league, hasPlan, arrivals }: ArrivalsSectionProps) {
  const { state } = arrivals;
  if (state.status === 'loading') return <ThemedText type="small">Loading arrivals...</ThemedText>;
  if (state.status === 'error') {
    return (
      <>
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          Could not load arrivals. {state.message}
        </ThemedText>
        <ThemedView style={styles.actions}>
          <Button label="Retry" onPress={arrivals.retry} />
        </ThemedView>
      </>
    );
  }
  const status = state.arrivals;
  if (status.sources.length === 0 && status.blocked.length === 0) return null;
  return <ArrivalsBody league={league} hasPlan={hasPlan} status={status} refresh={arrivals.refresh} />;
}

function ArrivalsBody({ league, hasPlan, status, refresh }: { league: League; hasPlan: boolean; status: ArrivalStatus; refresh: () => Promise<void> }) {
  const db = useDatabase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamName = (a: { franchiseId: string; fromLeagueId: string }) => {
    const archive = status.sources.find((s) => s.league.id === a.fromLeagueId)?.archive;
    const team = archive?.teams.find((t) => t.franchiseId === a.franchiseId);
    return team ? displayName(team.identity, league.namingStyle) : 'Unknown team';
  };

  const stage = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await stageArrivals(db, league);
      if (result.ok) await refresh();
      else setError(planErrorText(result.error, league));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const blocked = status.blocked.length > 0;
  const staged = status.staged !== null && status.staged.length + status.expected.length > 0;
  const canStage = hasPlan && !blocked && !busy;

  return (
    <ThemedView style={styles.section}>
      <ThemedText type="smallBold">Arrivals</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Teams moving in from the linked leagues. Their ratings are adjusted and control stars rerolled when staged. Nothing changes until the offseason is approved.
      </ThemedText>
      {status.blocked.map((b) => (
        <ThemedText key={`${b.leagueId}-${b.direction}`} type="small" accessibilityRole="alert">
          {blockedText(b)}
        </ThemedText>
      ))}
      {!blocked && status.expected.length === 0 && <ThemedText type="small">No teams are moving in from the linked leagues.</ThemedText>}
      {!blocked &&
        status.expected.map((e) => (
          <ThemedText key={e.franchiseId}>
            {teamName(e)} ({e.movement === 'demoted' ? 'demoted from the league above' : 'promoted from the league below'})
          </ThemedText>
        ))}
      {status.staged !== null && !status.current && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          The linked leagues&apos; plans changed since these arrivals were staged. Restage to update them.
        </ThemedText>
      )}
      {status.staged !== null && status.staged.length > 0 && (
        <ThemedView style={styles.list}>
          {status.staged.map((arrival) => (
            <ThemedView key={arrival.franchiseId} style={styles.team}>
              <ThemedText type="smallBold">{teamName(arrival)}</ThemedText>
              {arrival.players.map((p) => {
                const line = playerLine(p);
                return (
                  <ThemedText key={p.id} type="small" accessibilityLabel={`${line.label}. ${line.spoken ?? line.details}`}>
                    {line.label}  {line.details}
                  </ThemedText>
                );
              })}
            </ThemedView>
          ))}
        </ThemedView>
      )}
      {!hasPlan && <ThemedText type="small">Save this league&apos;s plan above before staging arrivals.</ThemedText>}
      {error !== null && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          Could not stage arrivals. {error}
        </ThemedText>
      )}
      <ThemedView style={styles.actions}>
        <Button
          label={busy ? 'Staging...' : staged ? 'Restage arrivals' : 'Stage arrivals'}
          variant="primary"
          disabled={!canStage}
          onPress={stage}
        />
      </ThemedView>
      {staged && <ThemedText type="small" themeColor="textSecondary">Restaging rerolls the control stars.</ThemedText>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two, paddingTop: Spacing.two },
  list: { gap: Spacing.two },
  team: { gap: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
