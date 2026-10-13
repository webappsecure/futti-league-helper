import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import type { Roster, RosterPlayer } from '@/rosters/roster';
import { rerollPlayer, rerollTeam, type RosterError, type RosterResult } from '@/rosters/roster-repository';
import { useDatabase } from '@/storage/storage-provider';
import { displayName, type Franchise } from '@/teams/franchise';

interface RosterViewProps {
  league: League;
  team: Franchise;
  roster: Roster;
  onChanged: () => Promise<void>;
  onBack: () => void;
}

export function rosterErrorText(error: RosterError): string {
  switch (error.kind) {
    case 'no-names':
      return 'No unused last names are left.';
    case 'no-teams':
      return 'This league has no teams.';
    case 'not-found':
      return 'That team or player no longer exists.';
    case 'storage':
      return error.error.message;
  }
}

function stars(count: number): string {
  return count === 0 ? '-' : '★'.repeat(count);
}

function PlayerRow({ player, busy, onReroll }: { player: RosterPlayer; busy: boolean; onReroll: () => void }) {
  const details =
    player.kind === 'standard'
      ? `Age ${player.age} · OF ${player.offense} · DE ${player.defense} · SP ${player.sportsmanship} · CO ${stars(player.controlStars)}`
      : `Age ${player.age} · GO ${player.goaltending} · SP ${player.sportsmanship}`;
  const label = player.kind === 'standard' ? player.name : `${player.name} (G)`;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedView style={styles.row}>
        <ThemedView style={styles.grow}>
          <ThemedText type="smallBold">{label}</ThemedText>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            accessibilityLabel={
              player.kind === 'standard' ? details.replace(/CO .*$/, `${player.controlStars} control stars`) : undefined
            }>
            {details}
          </ThemedText>
        </ThemedView>
        <Button label="Reroll" accessibilityLabel={`Reroll ${player.name}`} disabled={busy} onPress={onReroll} />
      </ThemedView>
    </ThemedView>
  );
}

export function RosterView({ league, team, roster, onChanged, onBack }: RosterViewProps) {
  const db = useDatabase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identity = team.identities[0];
  const label = displayName(identity, league.namingStyle);

  const run = async (action: () => Promise<RosterResult<unknown>>) => {
    setBusy(true);
    setError(null);
    const result = await action();
    if (!result.ok) {
      setError(rosterErrorText(result.error));
      setBusy(false);
      return;
    }
    await onChanged();
    setBusy(false);
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.row}>
        <ThemedView style={[styles.swatch, { backgroundColor: identity.primaryColor }]} />
        <ThemedView style={[styles.swatch, { backgroundColor: identity.secondaryColor }]} />
        <ThemedText type="subtitle" style={styles.grow}>
          {label}
        </ThemedText>
      </ThemedView>
      <ThemedText themeColor="textSecondary">Grade {team.initialGrade}</ThemedText>
      <ThemedView style={styles.row}>
        <Button label="Back to teams" onPress={onBack} />
        <Button label="Reroll team" disabled={busy} onPress={() => run(() => rerollTeam(db, league, team.id))} />
      </ThemedView>
      {error !== null && (
        <ThemedText accessibilityRole="alert" style={styles.error}>
          Could not reroll. {error}
        </ThemedText>
      )}
      {roster.players.map((player: RosterPlayer) => (
        <PlayerRow
          key={player.id}
          player={player}
          busy={busy}
          onReroll={() => run(() => rerollPlayer(db, league, team.id, player.id))}
        />
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#80808080' },
  error: { color: Accent.danger },
});
