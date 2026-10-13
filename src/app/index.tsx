import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { LeagueDetail } from '@/components/leagues/league-detail';
import { LeagueForm } from '@/components/leagues/league-form';
import { LeagueList } from '@/components/leagues/league-list';
import { MasterDetail } from '@/components/master-detail';
import { isTwoPane } from '@/components/master-detail-layout';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import { deleteLeague } from '@/leagues/league-repository';
import { useLeagues } from '@/leagues/use-leagues';
import { useDatabase } from '@/storage/storage-provider';

type Mode = 'view' | 'create' | 'edit' | 'confirm-delete';

export default function LeaguesScreen() {
  const db = useDatabase();
  const { state, refresh, retry } = useLeagues();
  const { width } = useWindowDimensions();
  const narrow = !isTwoPane(width);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const leagues = state.status === 'ready' ? state.leagues : [];
  const selected = leagues.find((league) => league.id === selectedId) ?? null;

  const select = (id: string | null) => {
    setSelectedId(id);
    setMode('view');
    setDeleteError(null);
  };

  const saved = async (league: League) => {
    await refresh();
    select(league.id);
  };

  const confirmDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteLeague(db, selected.id);
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error.kind === 'storage' ? result.error.error.message : 'Unexpected error.');
      return;
    }
    await refresh();
    select(null);
  };

  let detail;
  if (mode === 'create') {
    detail = (
      <LeagueForm
        initial={null}
        onCancel={() => select(selectedId)}
        onSaved={saved}
      />
    );
  } else if (mode === 'edit' && selected) {
    detail = (
      <LeagueForm
        initial={selected}
        onCancel={() => select(selected.id)}
        onSaved={saved}
      />
    );
  } else if (selected) {
    detail = (
      <LeagueDetail
        key={selected.id}
        league={selected}
        confirmingDelete={mode === 'confirm-delete'}
        deleting={deleting}
        deleteError={deleteError}
        onEdit={() => setMode('edit')}
        onAskDelete={() => {
          setDeleteError(null);
          setMode('confirm-delete');
        }}
        onCancelDelete={() => select(selected.id)}
        onConfirmDelete={confirmDelete}
      />
    );
  } else {
    detail = (
      <ThemedText themeColor="textSecondary">
        Select a league, or create one to get started. Teams and rosters will appear here.
      </ThemedText>
    );
  }

  const showDetail = mode === 'create' || selected !== null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <MasterDetail
          showDetail={showDetail}
          master={
            <LeagueList
              state={state}
              selectedId={selectedId}
              onSelect={select}
              onNew={() => {
                setMode('create');
                setDeleteError(null);
              }}
              onRetry={retry}
            />
          }
          detail={
            <ScrollView contentContainerStyle={styles.detail}>
              {narrow && <Button label="Back" onPress={() => select(null)} />}
              {detail}
            </ScrollView>
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset + Spacing.three },
  detail: { gap: Spacing.three, padding: Spacing.one },
});
