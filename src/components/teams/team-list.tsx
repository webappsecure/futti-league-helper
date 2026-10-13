import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import { useDatabase } from '@/storage/storage-provider';
import { displayName, type Franchise } from '@/teams/franchise';
import { deleteFranchise } from '@/teams/franchise-repository';
import type { FranchisesState } from '@/teams/use-franchises';
import { TeamForm } from './team-form';

interface TeamsSectionProps {
  league: League;
  state: FranchisesState;
  refresh: () => Promise<void>;
  onRetry: () => void;
}

type TeamMode =
  | { kind: 'list' }
  | { kind: 'add' }
  | { kind: 'edit'; team: Franchise }
  | { kind: 'confirm-delete'; team: Franchise };

export function TeamsSection({ league, state, refresh, onRetry }: TeamsSectionProps) {
  const db = useDatabase();
  const [mode, setMode] = useState<TeamMode>({ kind: 'list' });
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const list = () => setMode({ kind: 'list' });
  const saved = async () => {
    await refresh();
    list();
  };

  const confirmDelete = async (team: Franchise) => {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteFranchise(db, team.id);
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error.kind === 'storage' ? result.error.error.message : 'Unexpected error.');
      return;
    }
    await refresh();
    list();
  };

  if (mode.kind === 'add') {
    return <TeamForm league={league} initial={null} onSaved={saved} onCancel={list} />;
  }
  if (mode.kind === 'edit') {
    return <TeamForm league={league} initial={mode.team} onSaved={saved} onCancel={list} />;
  }

  const teams = state.status === 'ready' ? state.teams : [];
  const full = teams.length >= league.size;

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">Teams</ThemedText>
      {state.status === 'ready' && (
        <ThemedText themeColor="textSecondary">
          {teams.length} of {league.size} teams
        </ThemedText>
      )}
      <ThemedView style={styles.actions}>
        <Button label="Add team" variant="primary" disabled={state.status !== 'ready' || full} onPress={() => setMode({ kind: 'add' })} />
      </ThemedView>
      {full && state.status === 'ready' && (
        <ThemedText type="small" themeColor="textSecondary">
          This league is full.
        </ThemedText>
      )}

      {state.status === 'loading' && <ThemedText themeColor="textSecondary">Loading teams...</ThemedText>}

      {state.status === 'error' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText accessibilityRole="alert">Could not load teams. {state.message}</ThemedText>
          <Button label="Retry" onPress={onRetry} />
        </ThemedView>
      )}

      {state.status === 'ready' && (
        <>
          {state.unreadable > 0 && (
            <ThemedText type="small" themeColor="textSecondary" accessibilityRole="alert">
              {state.unreadable === 1
                ? '1 saved team could not be read.'
                : `${state.unreadable} saved teams could not be read.`}
            </ThemedText>
          )}
          {teams.length === 0 ? (
            <ThemedText themeColor="textSecondary">No teams yet</ThemedText>
          ) : (
            teams.map((team) => {
              const identity = team.identities[0];
              const label = displayName(identity, league.namingStyle);
              const confirming = mode.kind === 'confirm-delete' && mode.team.id === team.id;
              return (
                <ThemedView key={team.id} type="backgroundElement" style={styles.card}>
                  <ThemedView style={styles.row}>
                    <ThemedView style={[styles.swatch, { backgroundColor: identity.primaryColor }]} />
                    <ThemedView style={[styles.swatch, { backgroundColor: identity.secondaryColor }]} />
                    <ThemedView style={styles.name}>
                      <ThemedText type="smallBold">{label}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Grade {team.initialGrade}
                      </ThemedText>
                    </ThemedView>
                    {!confirming && (
                      <ThemedView style={styles.actions}>
                        <Button label="Edit" accessibilityLabel={`Edit ${label}`} onPress={() => setMode({ kind: 'edit', team })} />
                        <Button
                          label="Delete"
                          accessibilityLabel={`Delete ${label}`}
                          variant="danger"
                          onPress={() => {
                            setDeleteError(null);
                            setMode({ kind: 'confirm-delete', team });
                          }}
                        />
                      </ThemedView>
                    )}
                  </ThemedView>
                  {confirming && (
                    <>
                      <ThemedText accessibilityRole="alert">Delete {label}? This cannot be undone.</ThemedText>
                      {deleteError !== null && (
                        <ThemedText accessibilityRole="alert" style={styles.error}>
                          Could not delete. {deleteError}
                        </ThemedText>
                      )}
                      <ThemedView style={styles.actions}>
                        <Button label="Delete" variant="danger" disabled={deleting} onPress={() => confirmDelete(team)} />
                        <Button label="Cancel" disabled={deleting} onPress={list} />
                      </ThemedView>
                    </>
                  )}
                </ThemedView>
              );
            })
          )}
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#80808080' },
  name: { flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
