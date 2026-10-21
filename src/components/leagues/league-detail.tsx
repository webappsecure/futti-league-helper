import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import { LinkedLeagues } from '@/components/leagues/linked-leagues';
import { leagueAbove, leagueBelow } from '@/leagues/league-links';
import { TeamsSection } from '@/components/teams/team-list';
import { OffseasonStatusCard } from '@/components/offseason/offseason-status-card';
import { SeasonCard } from '@/components/seasons/season-card';
import { usePrintCards } from '@/cards/use-print-cards';
import { useLeagueSeason } from '@/seasons/use-league-season';
import { useFranchises } from '@/teams/use-franchises';

interface LeagueDetailProps {
  league: League;
  leagues: League[];
  onLinksChanged: () => Promise<void>;
  confirmingDelete: boolean;
  deleting: boolean;
  deleteError: string | null;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

const NAMING_TEXT = {
  cityAndName: 'City and team name (Richmond Greyhounds)',
  nameOnly: 'Team name only (AFC Richmond)',
} as const;

export function LeagueDetail({
  league,
  leagues,
  onLinksChanged,
  confirmingDelete,
  deleting,
  deleteError,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: LeagueDetailProps) {
  const { state, refresh, retry } = useFranchises(league);
  const season = useLeagueSeason(league);
  const accepted = season.state.status === 'ready' && season.state.season !== null;
  const printCards = usePrintCards(league, season.state.status === 'ready' ? season.state.season : null);
  const [teamFocused, setTeamFocused] = useState(false);
  const isLinked = leagueAbove(league, leagues) !== null || leagueBelow(league, leagues) !== null;
  const hasTeams = state.status === 'ready' && state.teams.length > 0;

  return (
    <ThemedView style={styles.container}>
      {!teamFocused && (
        <>
        <ThemedText type="subtitle">{league.name}</ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText>Size: {league.size} teams</ThemedText>
          <ThemedText>Team names: {NAMING_TEXT[league.namingStyle]}</ThemedText>
          {league.relegation ? (
            <>
              <ThemedText>Promotion and relegation: on</ThemedText>
              <ThemedText>Teams promoted each season: {league.promotedCount}</ThemedText>
              <ThemedText>Teams demoted each season: {league.demotedCount}</ThemedText>
            </>
          ) : (
            <ThemedText>Promotion and relegation: off</ThemedText>
          )}
        </ThemedView>

        <LinkedLeagues league={league} leagues={leagues} onChanged={onLinksChanged} />

        {season.state.status === 'ready' && season.state.season !== null && state.status === 'ready' && (
          <SeasonCard key={season.state.season.id} league={league} season={season.state.season} teams={state.teams} refreshSeason={season.refresh} />
        )}

        {season.state.status === 'ready' && season.state.season?.status === 'offseason' && league.relegation && (
          <OffseasonStatusCard key={`offseason-${season.state.season.id}`} league={league} season={season.state.season} />
        )}

        {accepted && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Game cards</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Prints the cards for every team for the current season on US Letter landscape sheets, four teams per sheet.
              {Platform.OS !== 'web' && ' Save as PDF opens the share sheet so you can save the file.'}
            </ThemedText>
            {printCards.error !== null && (
              <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
                {printCards.error.action === 'pdf' ? 'Could not save the PDF.' : 'Could not print cards.'} {printCards.error.message}
              </ThemedText>
            )}
            <ThemedView style={styles.actions}>
              <Button
                label={printCards.active === 'print' ? 'Preparing...' : 'Print cards'}
                disabled={printCards.active !== null}
                onPress={printCards.print}
              />
              {Platform.OS !== 'web' && (
                <Button
                  label={printCards.active === 'pdf' ? 'Preparing...' : 'Save cards as PDF'}
                  disabled={printCards.active !== null}
                  onPress={printCards.saveAsPdf}
                />
              )}
            </ThemedView>
          </ThemedView>
        )}
        </>
      )}

      <TeamsSection
        league={league}
        state={state}
        refresh={refresh}
        onRetry={retry}
        season={season.state}
        refreshSeason={season.refresh}
        onRetrySeason={season.retry}
        onFocusChange={setTeamFocused}
      />

      {!teamFocused &&
        (confirmingDelete ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText accessibilityRole="alert">
              Delete {league.name}?{hasTeams ? ' Its teams are deleted too.' : ''}{accepted ? ' Its accepted season is deleted too.' : ''}{isLinked ? ' It is unlinked from its neighboring leagues.' : ''} This cannot be undone.
            </ThemedText>
            {deleteError !== null && (
              <ThemedText accessibilityRole="alert" style={styles.error}>
                Could not delete. {deleteError}
              </ThemedText>
            )}
            <ThemedView style={styles.actions}>
              <Button label="Delete" variant="danger" disabled={deleting} onPress={onConfirmDelete} />
              <Button label="Cancel" disabled={deleting} onPress={onCancelDelete} />
            </ThemedView>
          </ThemedView>
        ) : (
          <ThemedView style={styles.actions}>
            <Button label="Edit" onPress={onEdit} />
            <Button label="Delete" variant="danger" onPress={onAskDelete} />
          </ThemedView>
        ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
