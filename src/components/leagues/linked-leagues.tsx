import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import { linkLeagues, unlinkLeagues, type LinkResult } from '@/leagues/league-link-repository';
import { leagueAbove, leagueBelow, linkProblem } from '@/leagues/league-links';
import { useDatabase } from '@/storage/storage-provider';

interface LinkedLeaguesProps {
  league: League;
  leagues: League[];
  onChanged: () => Promise<void>;
}

type Side = 'above' | 'below';

function failureText(result: LinkResult): string {
  if (result.ok) return '';
  const { error } = result;
  if (error.kind === 'link') return error.message;
  if (error.kind === 'not-found') return 'A league no longer exists.';
  return error.error.message;
}

export function LinkedLeagues({ league, leagues, onChanged }: LinkedLeaguesProps) {
  const db = useDatabase();
  const [picking, setPicking] = useState<Side | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<LinkResult>) => {
    setBusy(true);
    setError(null);
    const result = await action();
    if (result.ok) setPicking(null);
    else setError(failureText(result));
    await onChanged();
    setBusy(false);
  };

  const neighbor = { above: leagueAbove(league, leagues), below: leagueBelow(league, leagues) };
  const others = leagues.filter((l) => l.id !== league.id);

  const row = (side: Side) => {
    const other = neighbor[side];
    const title = side === 'above' ? 'League above' : 'League below';
    return (
      <ThemedView style={styles.row} key={side}>
        <ThemedText>
          {title}: {other ? other.name : 'None'}
        </ThemedText>
        {other ? (
          <Button
            label="Unlink"
            disabled={busy}
            accessibilityLabel={`Unlink ${other.name}`}
            onPress={() =>
              run(() => (side === 'above' ? unlinkLeagues(db, other.id, league.id) : unlinkLeagues(db, league.id, other.id)))
            }
          />
        ) : (
          <Button
            label={picking === side ? 'Cancel' : 'Link'}
            disabled={busy}
            accessibilityLabel={picking === side ? `Cancel linking ${title.toLowerCase()}` : `Link ${title.toLowerCase()}`}
            onPress={() => {
              setError(null);
              setPicking(picking === side ? null : side);
            }}
          />
        )}
      </ThemedView>
    );
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Linked leagues</ThemedText>
      {row('above')}
      {row('below')}

      {picking !== null && (
        <ThemedView style={styles.picker}>
          <ThemedText type="small" themeColor="textSecondary">
            Choose the league {picking} {league.name}.
          </ThemedText>
          {others.length === 0 && <ThemedText themeColor="textSecondary">There are no other leagues to link.</ThemedText>}
          {others.map((candidate) => {
            const [upper, lower] = picking === 'below' ? [league, candidate] : [candidate, league];
            const problem = linkProblem(upper, lower, leagues);
            return (
              <ThemedView key={candidate.id} style={styles.row}>
                <ThemedView style={styles.candidate}>
                  <ThemedText>{candidate.name}</ThemedText>
                  {problem !== null && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {problem}
                    </ThemedText>
                  )}
                </ThemedView>
                <Button
                  label="Link"
                  variant="primary"
                  disabled={busy || problem !== null}
                  accessibilityLabel={`Link ${candidate.name} ${picking} ${league.name}`}
                  onPress={() => run(() => linkLeagues(db, upper.id, lower.id))}
                />
              </ThemedView>
            );
          })}
        </ThemedView>
      )}

      {error !== null && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          Could not change the link. {error}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  picker: { gap: Spacing.two },
  candidate: { flex: 1 },
  error: { color: Accent.danger },
});
