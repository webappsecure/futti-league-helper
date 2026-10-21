import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { SortableList } from '@/components/seasons/sortable-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import { reorderTeams, type SeasonArchive } from '@/seasons/season-archive';
import { finishErrorText, updateFinishingOrder } from '@/seasons/season-archive-repository';
import { useDatabase } from '@/storage/storage-provider';
import { displayName } from '@/teams/franchise';

interface OrderStepProps {
  league: League;
  archive: SeasonArchive;
  refresh: () => Promise<void>;
}

/** The season's final finishing order, with a correction mode. */
export function OrderStep({ league, archive, refresh }: OrderStepProps) {
  const db = useDatabase();
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: string) => {
    const team = archive.teams.find((t) => t.franchiseId === id);
    return team ? displayName(team.identity, league.namingStyle) : 'Unknown team';
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await updateFinishingOrder(db, league, order);
      if (result.ok) {
        await refresh();
        setEditing(false);
      } else {
        setError(finishErrorText(result.error));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.body}>
      {editing ? (
        <>
          <SortableList rows={order.map((id) => ({ id, label: nameOf(id) }))} disabled={busy} onMove={(from, to) => setOrder((o) => reorderTeams(o, from, to))} />
          <ThemedView style={styles.actions}>
            <Button label={busy ? 'Saving...' : 'Save order'} variant="primary" disabled={busy} onPress={save} />
            <Button label="Cancel" disabled={busy} onPress={() => setEditing(false)} />
          </ThemedView>
        </>
      ) : (
        <>
          {archive.teams.map((t) => (
            <ThemedText key={t.franchiseId}>
              {t.position}. {displayName(t.identity, league.namingStyle)}
            </ThemedText>
          ))}
          <ThemedView style={styles.actions}>
            <Button
              label="Edit finishing order"
              onPress={() => {
                setOrder(archive.teams.map((t) => t.franchiseId));
                setError(null);
                setEditing(true);
              }}
            />
          </ThemedView>
        </>
      )}
      {error !== null && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          Could not save. {error}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
