import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ArrivalsSection } from '@/components/offseason/arrivals-section';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import { planErrorText, stageArrivals } from '@/offseason/offseason-plan-repository';
import type { useArrivalStatus } from '@/offseason/use-arrival-status';
import { useDatabase } from '@/storage/storage-provider';

interface ArrivalsStepProps {
  league: League;
  hasPlan: boolean;
  arrivals: ReturnType<typeof useArrivalStatus>;
  /** Reloads the plan and arrivals after a change. */
  refresh: () => Promise<void>;
}

/** Teams moving in from the linked leagues; says so when there are no linked leagues. */
export function ArrivalsStep({ league, hasPlan, arrivals, refresh }: ArrivalsStepProps) {
  const db = useDatabase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { state } = arrivals;

  if (state.status === 'ready' && state.arrivals.sources.length === 0 && state.arrivals.blocked.length === 0) {
    const stale = (state.arrivals.staged ?? []).length > 0;
    const clear = async () => {
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
    return (
      <ThemedView style={styles.body}>
        <ThemedText>No teams are moving in from linked leagues.</ThemedText>
        {stale && (
          <>
            <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
              Arrivals were staged earlier, but the linked league is no longer linked. Clear them to continue.
            </ThemedText>
            {error !== null && (
              <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
                Could not clear. {error}
              </ThemedText>
            )}
            <ThemedView style={styles.actions}>
              <Button label={busy ? 'Clearing...' : 'Clear staged arrivals'} variant="primary" disabled={busy || !hasPlan} onPress={clear} />
            </ThemedView>
          </>
        )}
      </ThemedView>
    );
  }
  return <ArrivalsSection league={league} hasPlan={hasPlan} arrivals={arrivals} />;
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
