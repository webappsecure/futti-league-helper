import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { League } from '@/leagues/league';
import { playerLine } from '@/rosters/player-line';
import { NAME_MAX_LENGTH, type Roster, type RosterPlayer } from '@/rosters/roster';
import { renamePlayer, rerollPlayer, rerollTeam, type RosterError, type RosterResult } from '@/rosters/roster-repository';
import { LOCKED_TEXT } from '@/seasons/season';
import { useDatabase } from '@/storage/storage-provider';
import { displayName, type Franchise } from '@/teams/franchise';

interface RosterViewProps {
  league: League;
  team: Franchise;
  roster: Roster;
  /** True once the league is accepted: rerolls are hidden. */
  locked?: boolean;
  onChanged: () => Promise<void>;
  onBack: () => void;
}

export function rosterErrorText(error: RosterError): string {
  switch (error.kind) {
    case 'no-names':
      return 'No unused last names are left.';
    case 'invalid-name':
      return `Use letters, spaces, apostrophes and hyphens only, up to ${NAME_MAX_LENGTH} characters.`;
    case 'name-taken':
      return 'That name is already used or has been burned. Pick another.';
    case 'locked':
      return LOCKED_TEXT;
    case 'no-teams':
      return 'This league has no teams.';
    case 'not-found':
      return 'That team or player no longer exists.';
    case 'storage':
      return error.error.message;
  }
}

function PlayerRow({
  player,
  busy,
  onReroll,
  onRename,
}: {
  player: RosterPlayer;
  busy: boolean;
  onReroll: (() => void) | null;
  /** Saves a typed name; resolves to an error message, or null when saved. Null hides renaming. */
  onRename: ((name: string) => Promise<string | null>) | null;
}) {
  const theme = useTheme();
  const { label, details, spoken } = playerLine(player);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const startEdit = () => {
    setText(player.name);
    setNameError(null);
    setEditing(true);
  };

  const save = async () => {
    if (onRename === null) return;
    const message = await onRename(text);
    if (message === null) setEditing(false);
    else setNameError(message);
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedView style={styles.row}>
        <ThemedView style={styles.grow}>
          <ThemedText type="smallBold">{label}</ThemedText>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            accessibilityLabel={spoken}>
            {details}
          </ThemedText>
        </ThemedView>
        {onRename !== null && !editing && (
          <Button label="Rename" accessibilityLabel={`Rename ${player.name}`} disabled={busy} onPress={startEdit} />
        )}
        {onReroll !== null && (
          <Button label="Reroll" accessibilityLabel={`Reroll ${player.name}`} disabled={busy} onPress={onReroll} />
        )}
      </ThemedView>
      {editing && (
        <ThemedView style={styles.field}>
          <ThemedText type="smallBold">Last name</ThemedText>
          <TextInput
            accessibilityLabel={`Last name for ${player.name}`}
            value={text}
            onChangeText={(next) => {
              setText(next);
              setNameError(null);
            }}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={NAME_MAX_LENGTH}
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected },
            ]}
          />
          {nameError !== null && (
            <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
              {nameError}
            </ThemedText>
          )}
          <ThemedView style={styles.row}>
            <Button label="Save" variant="primary" disabled={busy} onPress={save} />
            <Button label="Cancel" disabled={busy} onPress={() => setEditing(false)} />
          </ThemedView>
        </ThemedView>
      )}
    </ThemedView>
  );
}

export function RosterView({ league, team, roster, locked = false, onChanged, onBack }: RosterViewProps) {
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

  const rename = async (playerId: string, name: string): Promise<string | null> => {
    setBusy(true);
    const result = await renamePlayer(db, league, team.id, playerId, name);
    if (!result.ok) {
      setBusy(false);
      return rosterErrorText(result.error);
    }
    await onChanged();
    setBusy(false);
    return null;
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
        {!locked && (
          <Button label="Reroll team" disabled={busy} onPress={() => run(() => rerollTeam(db, league, team.id))} />
        )}
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
          onReroll={locked ? null : () => run(() => rerollPlayer(db, league, team.id, player.id))}
          onRename={locked ? null : (name) => rename(player.id, name)}
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
  field: { gap: Spacing.two },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#80808080' },
  error: { color: Accent.danger },
});
