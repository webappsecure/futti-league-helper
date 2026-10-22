import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { LeagueReview } from '@/components/rosters/league-review';
import { RosterView, rosterErrorText } from '@/components/rosters/roster-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import { generateLeagueRosters, rerollLeague } from '@/rosters/roster-repository';
import { useRosters } from '@/rosters/use-rosters';
import { LOCKED_TEXT } from '@/seasons/season';
import type { LeagueSeasonState } from '@/seasons/use-league-season';
import { useDatabase } from '@/storage/storage-provider';
import { displayName, type Franchise } from '@/teams/franchise';
import { deleteFranchise } from '@/teams/franchise-repository';
import type { FranchisesState } from '@/teams/use-franchises';
import { teamControls } from './team-controls';
import { TeamForm } from './team-form';

interface TeamsSectionProps {
  league: League;
  state: FranchisesState;
  refresh: () => Promise<void>;
  onRetry: () => void;
  season: LeagueSeasonState;
  refreshSeason: () => Promise<void>;
  onRetrySeason: () => void;
  /** Called when a team form or roster opens or closes, so the screen can hide league info. */
  onFocusChange?: (viewing: boolean) => void;
}

type TeamMode =
  | { kind: 'list' }
  | { kind: 'add' }
  | { kind: 'edit'; team: Franchise }
  | { kind: 'roster'; team: Franchise }
  | { kind: 'review' }
  | { kind: 'confirm-delete'; team: Franchise };

export function TeamsSection({ league, state, refresh, onRetry, season, refreshSeason, onRetrySeason, onFocusChange }: TeamsSectionProps) {
  const db = useDatabase();
  const [mode, setMode] = useState<TeamMode>({ kind: 'list' });
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const rosters = useRosters(league);
  // An approved offseason replaces the rosters from the wizard screen, so read them again when this screen returns.
  const reloadRosters = useRef(rosters.refresh);
  useEffect(() => {
    reloadRosters.current = rosters.refresh;
  });
  useFocusEffect(useCallback(() => void reloadRosters.current(), []));
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [confirmingReroll, setConfirmingReroll] = useState(false);

  const show = (next: TeamMode) => {
    setMode(next);
    onFocusChange?.(next.kind === 'add' || next.kind === 'edit' || next.kind === 'roster' || next.kind === 'review');
  };
  const list = () => show({ kind: 'list' });
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
      setDeleteError(
        result.error.kind === 'storage' ? result.error.error.message : result.error.kind === 'locked' ? LOCKED_TEXT : 'Unexpected error.',
      );
      return;
    }
    await refresh();
    await rosters.refresh();
    list();
  };

  const runRosters = async (action: typeof generateLeagueRosters) => {
    setRosterBusy(true);
    setRosterError(null);
    setConfirmingReroll(false);
    const result = await action(db, league);
    if (!result.ok) setRosterError(rosterErrorText(result.error));
    else await rosters.refresh();
    setRosterBusy(false);
  };

  const accepted = season.status === 'ready' && season.season !== null;
  const seasonKnown = season.status === 'ready';

  if (mode.kind === 'review' && state.status === 'ready' && rosters.state.status === 'ready' && !accepted) {
    return (
      <LeagueReview
        league={league}
        teams={state.teams}
        rosters={rosters.state.rosters}
        onAccepted={async () => {
          await refreshSeason();
          list();
        }}
        onBack={list}
      />
    );
  }

  if (mode.kind === 'roster') {
    const roster = rosters.state.status === 'ready' ? rosters.state.rosters.find((r) => r.franchiseId === mode.team.id) : undefined;
    if (roster) {
      return <RosterView league={league} team={mode.team} roster={roster} locked={accepted} onChanged={rosters.refresh} onBack={list} />;
    }
  }

  if (mode.kind === 'add') {
    return <TeamForm league={league} initial={null} onSaved={saved} onCancel={list} />;
  }
  if (mode.kind === 'edit') {
    return <TeamForm league={league} initial={mode.team} onSaved={saved} onCancel={list} />;
  }

  const teams = state.status === 'ready' ? state.teams : [];
  const rosterList = rosters.state.status === 'ready' ? rosters.state.rosters : [];
  const hasRoster = (id: string) => rosterList.some((r) => r.franchiseId === id);
  const rostersReady = state.status === 'ready' && rosters.state.status === 'ready';
  const missingRosters = teams.filter((t) => !hasRoster(t.id)).length;
  const controls = teamControls({
    accepted,
    seasonKnown,
    teamsReady: state.status === 'ready',
    rostersReady,
    busy: rosterBusy,
    teamCount: teams.length,
    size: league.size,
    rosterCount: rosterList.length,
    missingRosters,
  });

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">Teams</ThemedText>
      {state.status === 'ready' && (
        <ThemedText themeColor="textSecondary">
          {teams.length} of {league.size} teams
        </ThemedText>
      )}
      {accepted && (
        <ThemedText themeColor="textSecondary">Accepted - Season 1. Teams and rosters are locked.</ThemedText>
      )}
      {season.status === 'error' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText accessibilityRole="alert">Could not check whether this league is accepted. {season.message}</ThemedText>
          <Button label="Retry" onPress={onRetrySeason} />
        </ThemedView>
      )}
      {controls.showActions && (
        <ThemedView style={styles.actions}>
          <Button
            label="Add team"
            variant="primary"
            disabled={!controls.addEnabled}
            onPress={() => show({ kind: 'add' })}
          />
        </ThemedView>
      )}
      {controls.full && controls.showActions && state.status === 'ready' && (
        <ThemedText type="small" themeColor="textSecondary">
          This league is full.
        </ThemedText>
      )}

      {controls.showActions && (
        <ThemedView style={styles.actions}>
          <Button
            label="Generate rosters"
            disabled={!controls.generateEnabled}
            onPress={() => runRosters(generateLeagueRosters)}
          />
          <Button
            label="Reroll all rosters"
            disabled={!controls.rerollAllEnabled}
            onPress={() => setConfirmingReroll(true)}
          />
          <Button
            label="Review and accept"
            variant="primary"
            disabled={!controls.reviewEnabled}
            onPress={() => show({ kind: 'review' })}
          />
        </ThemedView>
      )}
      {confirmingReroll && controls.showActions && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText accessibilityRole="alert">
            Replace every roster in this league? Current values are discarded.
          </ThemedText>
          <ThemedView style={styles.actions}>
            <Button label="Reroll all" variant="danger" disabled={rosterBusy} onPress={() => runRosters(rerollLeague)} />
            <Button label="Cancel" disabled={rosterBusy} onPress={() => setConfirmingReroll(false)} />
          </ThemedView>
        </ThemedView>
      )}
      {rosterError !== null && (
        <ThemedText accessibilityRole="alert" style={styles.error}>
          Could not update rosters. {rosterError}
        </ThemedText>
      )}
      {rosters.state.status === 'error' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText accessibilityRole="alert">Could not load rosters. {rosters.state.message}</ThemedText>
          <Button label="Retry" onPress={rosters.retry} />
        </ThemedView>
      )}
      {rosters.state.status === 'ready' && rosters.state.unreadable > 0 && (
        <ThemedText type="small" themeColor="textSecondary" accessibilityRole="alert">
          {rosters.state.unreadable === 1
            ? '1 saved roster could not be read.'
            : `${rosters.state.unreadable} saved rosters could not be read.`}
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
                        {rosters.state.status === 'ready' ? (hasRoster(team.id) ? ' · Roster generated' : ' · No roster yet') : ''}
                      </ThemedText>
                    </ThemedView>
                    {!confirming && (
                      <ThemedView style={styles.actions}>
                        {hasRoster(team.id) && (
                          <Button label="Roster" accessibilityLabel={`Roster for ${label}`} onPress={() => show({ kind: 'roster', team })} />
                        )}
                        {controls.showActions && (
                          <>
                            <Button
                              label="Edit"
                              accessibilityLabel={`Edit ${label}`}
                              disabled={!controls.editDeleteEnabled}
                              onPress={() => show({ kind: 'edit', team })}
                            />
                            <Button
                              label="Delete"
                              accessibilityLabel={`Delete ${label}`}
                              variant="danger"
                              disabled={!controls.editDeleteEnabled}
                              onPress={() => {
                                setDeleteError(null);
                                setMode({ kind: 'confirm-delete', team });
                              }}
                            />
                          </>
                        )}
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
