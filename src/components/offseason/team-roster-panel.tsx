import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { playerLine } from '@/rosters/player-line';
import type { RosterPlayer } from '@/rosters/roster';

export interface RosterRow {
  player: RosterPlayer;
  /** Years to add to the stored age (players that were aged this offseason). */
  ageBy: number;
  /** Short note such as "protected" or "free agent pick". */
  note?: string;
}

interface TeamRosterPanelProps {
  teamName: string;
  rows: RosterRow[];
}

/** A collapsed-by-default list of the team's players as they stand now, so the commissioner can see what it needs. */
export function TeamRosterPanel({ teamName, rows }: TeamRosterPanelProps) {
  const [open, setOpen] = useState(false);
  const standard = rows.filter((r) => r.player.kind === 'standard');
  const goalies = rows.filter((r) => r.player.kind === 'goalie');
  const line = ({ player, ageBy, note }: RosterRow) => {
    const text = playerLine(player);
    const details = text.details.replace(`Age ${player.age}`, `Age ${player.age + ageBy}`);
    return (
      <ThemedText key={player.id} type="small" accessibilityLabel={`${text.label}. ${text.spoken ?? details}${note ? `. ${note}` : ''}`}>
        {text.label}  {details}
        {note ? `  (${note})` : ''}
      </ThemedText>
    );
  };
  return (
    <ThemedView style={styles.body}>
      <Button
        label={open ? 'Hide roster' : 'Show roster'}
        accessibilityLabel={`${open ? 'Hide' : 'Show'} roster of ${teamName}`}
        onPress={() => setOpen((v) => !v)}
      />
      {open && (
        <ThemedView type="backgroundElement" style={styles.panel}>
          <ThemedText type="smallBold">
            {teamName}: {standard.length} position {standard.length === 1 ? 'player' : 'players'}, {goalies.length} {goalies.length === 1 ? 'goaltender' : 'goaltenders'}
          </ThemedText>
          {standard.map(line)}
          {goalies.map(line)}
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two, alignItems: 'flex-start' },
  panel: { gap: Spacing.one, padding: Spacing.three, borderRadius: Spacing.two, alignSelf: 'stretch' },
});
