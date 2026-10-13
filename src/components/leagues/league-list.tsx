import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import type { LeaguesState } from '@/leagues/use-leagues';

interface LeagueListProps {
  state: LeaguesState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRetry: () => void;
}

function summary(league: League): string {
  return `${league.size} teams${league.relegation ? ', promotion and relegation' : ''}`;
}

export function LeagueList({ state, selectedId, onSelect, onNew, onRetry }: LeagueListProps) {
  return (
    <ThemedView style={styles.container} type="backgroundElement">
      <ThemedText type="subtitle">Leagues</ThemedText>
      <Button label="New league" variant="primary" onPress={onNew} />

      {state.status === 'loading' && <ThemedText themeColor="textSecondary">Loading leagues...</ThemedText>}

      {state.status === 'error' && (
        <ThemedView type="backgroundElement" style={styles.message}>
          <ThemedText accessibilityRole="alert">Could not load leagues. {state.message}</ThemedText>
          <Button label="Retry" onPress={onRetry} />
        </ThemedView>
      )}

      {state.status === 'ready' && (
        <>
          {state.unreadable > 0 && (
            <ThemedText type="small" themeColor="textSecondary" accessibilityRole="alert">
              {state.unreadable === 1
                ? '1 saved league could not be read.'
                : `${state.unreadable} saved leagues could not be read.`}
            </ThemedText>
          )}
          {state.leagues.length === 0 ? (
            <ThemedText themeColor="textSecondary">No leagues yet</ThemedText>
          ) : (
            <ScrollView contentContainerStyle={styles.rows}>
              {state.leagues.map((league) => (
                <Pressable
                  key={league.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: league.id === selectedId }}
                  onPress={() => onSelect(league.id)}>
                  <ThemedView
                    type={league.id === selectedId ? 'backgroundSelected' : 'background'}
                    style={styles.row}>
                    <ThemedText type="smallBold">{league.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {summary(league)}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: Spacing.three },
  message: { gap: Spacing.two },
  rows: { gap: Spacing.two },
  row: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.half },
});
