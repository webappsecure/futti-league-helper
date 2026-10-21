import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { SortableList } from '@/components/seasons/sortable-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import type { Season } from '@/seasons/season';
import { reorderTeams } from '@/seasons/season-archive';
import { finishErrorText, finishSeason } from '@/seasons/season-archive-repository';
import { useDatabase } from '@/storage/storage-provider';
import { displayName, identityForSeason, type Franchise } from '@/teams/franchise';

interface SeasonCardProps {
  league: League;
  season: Season;
  teams: Franchise[];
  /** Reloads the league's season after it changes. */
  refreshSeason: () => Promise<void>;
}

export function SeasonCard({ league, season, teams, refreshSeason }: SeasonCardProps) {
  const db = useDatabase();
  const labelFor = (franchise: Franchise) =>
    displayName(identityForSeason(franchise, season.index) ?? franchise.identities[0], league.namingStyle);

  const [order, setOrder] = useState<string[]>(() => teams.map((t) => t.id));
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<{ ok: true } | { ok: false; message: string }>, after: () => void) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.ok) {
        await refreshSeason();
        after();
      } else {
        setError(result.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const endSeason = () =>
    run(async () => {
      const r = await finishSeason(db, league, order);
      return r.ok ? { ok: true } : { ok: false, message: finishErrorText(r.error) };
    }, () => setConfirmingEnd(false));

  const move = (from: number, to: number) => setOrder((current) => reorderTeams(current, from, to));
  const activeRows = order.flatMap((id) => {
    const team = teams.find((t) => t.id === id);
    return team ? [{ id, label: labelFor(team) }] : [];
  });

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Season {season.index}</ThemedText>
      {error !== null && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          Could not save. {error}
        </ThemedText>
      )}

      {season.status === 'active' && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            This season is in progress. When it is over, drag the teams into their final finishing order, first place at the top.
          </ThemedText>
          {teams.length === 0 ? (
            <ThemedText type="small">This league has no teams.</ThemedText>
          ) : (
            <SortableList rows={activeRows} disabled={busy || confirmingEnd} onMove={move} />
          )}
          {confirmingEnd ? (
            <>
              <ThemedText accessibilityRole="alert">
                This ends season {season.index} and saves a snapshot of every roster. You can still correct the finishing order afterwards.
              </ThemedText>
              <ThemedView style={styles.actions}>
                <Button label={busy ? 'Ending...' : 'End season'} variant="danger" disabled={busy} onPress={endSeason} />
                <Button label="Cancel" disabled={busy} onPress={() => setConfirmingEnd(false)} />
              </ThemedView>
            </>
          ) : (
            <ThemedView style={styles.actions}>
              <Button label="End season" disabled={teams.length === 0} onPress={() => setConfirmingEnd(true)} />
            </ThemedView>
          )}
        </>
      )}

      {season.status !== 'active' && (
        <ThemedText type="small" themeColor="textSecondary">
          Season {season.index} has ended. Its rosters and team names are saved.
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  list: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  position: { width: 28 },
  team: { flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
