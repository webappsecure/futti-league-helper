import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import { useOffseasonData } from '@/offseason/use-offseason-data';
import { firstIncompleteStep, STEP_INFO, WIZARD_STEPS } from '@/offseason/wizard';
import type { Season } from '@/seasons/season';

interface OffseasonStatusCardProps {
  league: League;
  season: Season;
}

/** Where the offseason stands, with a button into the wizard. Shown for a league whose season has ended. */
export function OffseasonStatusCard({ league, season }: OffseasonStatusCardProps) {
  const { data, refresh, retry } = useOffseasonData(league, season);
  // The wizard changes the plan from another screen, so re-read it whenever this one comes back into view.
  const latestRefresh = useRef(refresh);
  useEffect(() => {
    latestRefresh.current = refresh;
  });
  useFocusEffect(
    useCallback(() => {
      void latestRefresh.current();
    }, []),
  );
  const target = data.status === 'ready' ? (firstIncompleteStep(data.statuses) ?? WIZARD_STEPS[WIZARD_STEPS.length - 1]) : WIZARD_STEPS[0];

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Offseason</ThemedText>
      {data.status === 'loading' && <ThemedText type="small">Loading...</ThemedText>}
      {data.status === 'error' && (
        <>
          <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
            Could not load the offseason. {data.message}
          </ThemedText>
          <ThemedView style={styles.actions}>
            <Button label="Retry" onPress={retry} />
          </ThemedView>
        </>
      )}
      {data.status === 'no-archive' && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          The saved results for this season could not be found.
        </ThemedText>
      )}
      {data.status === 'ready' && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {firstIncompleteStep(data.statuses) === null ? 'All steps are done.' : `Next: ${STEP_INFO[target].title}.`} Nothing changes until the offseason is approved.
          </ThemedText>
          <ThemedView style={styles.actions}>
            <Button label="Continue offseason" variant="primary" onPress={() => router.push(`/offseason/${league.id}/${target}` as Href)} />
          </ThemedView>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
