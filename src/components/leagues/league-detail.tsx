import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import { LinkedLeagues } from '@/components/leagues/linked-leagues';
import { leagueAbove, leagueBelow } from '@/leagues/league-links';
import { TeamsSection } from '@/components/teams/team-list';
import { useFranchises } from '@/teams/use-franchises';

interface LeagueDetailProps {
  league: League;
  leagues: League[];
  onLinksChanged: () => Promise<void>;
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
  leagues,
  onLinksChanged,
  confirmingDelete,
  deleting,
  deleteError,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: LeagueDetailProps) {
  const { state, refresh, retry } = useFranchises(league);
  const isLinked = leagueAbove(league, leagues) !== null || leagueBelow(league, leagues) !== null;
  const hasTeams = state.status === 'ready' && state.teams.length > 0;

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

      <LinkedLeagues league={league} leagues={leagues} onChanged={onLinksChanged} />

      <TeamsSection league={league} state={state} refresh={refresh} onRetry={retry} />

      {confirmingDelete ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText accessibilityRole="alert">
            Delete {league.name}?{hasTeams ? ' Its teams are deleted too.' : ''}{isLinked ? ' It is unlinked from its neighboring leagues.' : ''} This cannot be undone.
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
