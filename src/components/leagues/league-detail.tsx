import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';

interface LeagueDetailProps {
  league: League;
  confirmingDelete: boolean;
  deleting: boolean;
  deleteError: string | null;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

const NAMING_TEXT = {
  cityAndName: 'City and team name (Richmond Greyhounds)',
  nameOnly: 'Team name only (AFC Richmond)',
} as const;

export function LeagueDetail({
  league,
  confirmingDelete,
  deleting,
  deleteError,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: LeagueDetailProps) {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">{league.name}</ThemedText>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText>Size: {league.size} teams</ThemedText>
        <ThemedText>Team names: {NAMING_TEXT[league.namingStyle]}</ThemedText>
        {league.relegation ? (
          <>
            <ThemedText>Promotion and relegation: on</ThemedText>
            <ThemedText>Teams promoted each season: {league.promotedCount}</ThemedText>
            <ThemedText>Teams demoted each season: {league.demotedCount}</ThemedText>
          </>
        ) : (
          <ThemedText>Promotion and relegation: off</ThemedText>
        )}
      </ThemedView>

      {confirmingDelete ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText accessibilityRole="alert">
            Delete {league.name}? This cannot be undone.
          </ThemedText>
          {deleteError !== null && (
            <ThemedText accessibilityRole="alert" style={styles.error}>
              Could not delete. {deleteError}
            </ThemedText>
          )}
          <ThemedView style={styles.actions}>
            <Button label="Delete" variant="danger" disabled={deleting} onPress={onConfirmDelete} />
            <Button label="Cancel" disabled={deleting} onPress={onCancelDelete} />
          </ThemedView>
        </ThemedView>
      ) : (
        <ThemedView style={styles.actions}>
          <Button label="Edit" onPress={onEdit} />
          <Button label="Delete" variant="danger" onPress={onAskDelete} />
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
