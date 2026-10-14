import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import { playerLine } from '@/rosters/player-line';
import type { Roster } from '@/rosters/roster';
import { acceptErrorText, acceptLeague } from '@/seasons/accept-league';
import { useDatabase } from '@/storage/storage-provider';
import { displayName, type Franchise } from '@/teams/franchise';

interface LeagueReviewProps {
  league: League;
  teams: Franchise[];
  rosters: Roster[];
  onAccepted: () => Promise<void>;
  onBack: () => void;
}

export function LeagueReview({ league, teams, rosters, onAccepted, onBack }: LeagueReviewProps) {
  const db = useDatabase();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    const result = await acceptLeague(db, league);
    if (!result.ok) {
      setError(acceptErrorText(result.error));
      setConfirming(false);
      setBusy(false);
      return;
    }
    await onAccepted();
    setBusy(false);
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">Review {league.name}</ThemedText>
      <ThemedView style={styles.row}>
        <Button label="Back to teams" disabled={busy} onPress={onBack} />
        {!confirming && (
          <Button label="Accept league" variant="primary" disabled={busy} onPress={() => setConfirming(true)} />
        )}
      </ThemedView>
      {confirming && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText accessibilityRole="alert">
            Accept this league? Rosters are locked and become season 1. This cannot be undone.
          </ThemedText>
          <ThemedView style={styles.row}>
            <Button label="Accept" variant="primary" disabled={busy} onPress={accept} />
            <Button label="Cancel" disabled={busy} onPress={() => setConfirming(false)} />
          </ThemedView>
        </ThemedView>
      )}
      {error !== null && (
        <ThemedText accessibilityRole="alert" style={styles.error}>
          Could not accept. {error}
        </ThemedText>
      )}
      {teams.map((team) => {
        const identity = team.identities[0];
        const roster = rosters.find((r) => r.franchiseId === team.id);
        return (
          <ThemedView key={team.id} type="backgroundElement" style={styles.card}>
            <ThemedView style={styles.row}>
              <ThemedView style={[styles.swatch, { backgroundColor: identity.primaryColor }]} />
              <ThemedView style={[styles.swatch, { backgroundColor: identity.secondaryColor }]} />
              <ThemedText type="smallBold">{displayName(identity, league.namingStyle)}</ThemedText>
            </ThemedView>
            {roster === undefined ? (
              <ThemedText type="small" themeColor="textSecondary">
                No roster yet
              </ThemedText>
            ) : (
              roster.players.map((player) => {
                const { label, details, spoken } = playerLine(player);
                return (
                  <ThemedView key={player.id}>
                    <ThemedText type="smallBold">{label}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" accessibilityLabel={spoken}>
                      {details}
                    </ThemedText>
                  </ThemedView>
                );
              })
            )}
          </ThemedView>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#80808080' },
  error: { color: Accent.danger },
});
