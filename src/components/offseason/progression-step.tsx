import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { starAdjustment } from '@/offseason/approval';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import type { OffseasonPlan, StagedProgression } from '@/offseason/offseason-plan';
import { planErrorText, type ArrivalStatus } from '@/offseason/offseason-plan-repository';
import { progressionPlayers } from '@/offseason/progression';
import { runProgression } from '@/offseason/progression-repository';
import { arrivalsReady, type ParticipatingTeam } from '@/offseason/roster-changes';
import { draftIsComplete, freeAgencyComplete, rookieDraftOrder } from '@/offseason/rookie-draft';
import type { RosterPlayer } from '@/rosters/roster';
import type { SeasonArchive } from '@/seasons/season-archive';
import { useDatabase } from '@/storage/storage-provider';

interface ProgressionStepProps {
  league: League;
  archive: SeasonArchive;
  plan: OffseasonPlan;
  teams: ParticipatingTeam[];
  arrivals: ArrivalStatus;
  nameOf: (team: ParticipatingTeam) => string;
  refresh: () => Promise<void>;
}

const ratings = (p: RosterPlayer) => (p.kind === 'goalie' ? `GO ${p.goaltending}` : `OF/DE ${p.offense}/${p.defense}`);

/** One line for a changed or retired player; null when nothing happened to the player. */
function describeResult(result: StagedProgression, before: RosterPlayer | undefined): string | null {
  const name = before?.name ?? 'Unknown player';
  if (result.replacement !== undefined) {
    const r = result.replacement;
    return `${name} retires; ${r.name}${r.kind === 'goalie' ? ' (G)' : ''} (age ${r.age}) joins. Roll ${result.roll}.`;
  }
  if (result.after === undefined || before === undefined) return null;
  return `${name} ${ratings(before)} to ${ratings(result.after)}. Roll ${result.roll}.`;
}

/** Rolls progression for every eligible player and shows what changed, team by team. */
export function ProgressionStep({ league, archive, plan, teams, arrivals, nameOf, refresh }: ProgressionStepProps) {
  const db = useDatabase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (teams.length === 0) return <ThemedText>No teams take part in the offseason.</ThemedText>;
  if (!arrivalsReady(arrivals)) {
    return (
      <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
        Stage the arrivals first, or restage them if the linked leagues&apos; plans changed.
      </ThemedText>
    );
  }
  if (!freeAgencyComplete(teams, plan)) return <ThemedText>Finish the free agency draft first.</ThemedText>;
  if (plan.draftPool === undefined || !draftIsComplete(teams, plan)) return <ThemedText>Finish the rookie draft first.</ThemedText>;

  const results = plan.progression;
  const eligible = teams.reduce((n, t) => n + progressionPlayers(t, teams, plan).length, 0);
  const allPlayers = teams.flatMap((t) => t.players);
  const sourceArchives = arrivals.sources.flatMap((s) => (s.archive === null ? [] : [s.archive]));
  const order = rookieDraftOrder(archive, plan, sourceArchives);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await runProgression(db, league);
      if (result.ok) await refresh();
      else setError(planErrorText(result.error, league));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.body}>
      {results === undefined ? (
        <>
          <ThemedText type="small">{eligible} players will progress. New draftees and players on new teams do not.</ThemedText>
          <ThemedView style={styles.actions}>
            <Button label="Run progression" variant="primary" disabled={busy} onPress={run} />
          </ThemedView>
        </>
      ) : (
        <>
          {order.map((id) => {
            const team = teams.find((t) => t.franchiseId === id);
            if (team === undefined) return null;
            const mine = results.filter((r) => r.franchiseId === id);
            const lines = mine.flatMap((r) => {
              const line = describeResult(r, allPlayers.find((p) => p.id === r.playerId));
              return line === null ? [] : [{ key: r.playerId, line }];
            });
            const unchanged = mine.length - lines.length;
            const stars = starAdjustment(team, teams, plan);
            return (
              <ThemedView key={id} style={styles.team}>
                <ThemedText type="smallBold">{nameOf(team)}</ThemedText>
                {lines.map(({ key, line }) => (
                  <ThemedText key={key} type="small">
                    {line}
                  </ThemedText>
                ))}
                <ThemedText type="small" themeColor="textSecondary">
                  {unchanged} {unchanged === 1 ? 'player' : 'players'} unchanged
                </ThemedText>
                {stars !== null && (
                  <ThemedText type="small">
                    Control stars adjusted from {stars.before} to {stars.after} when the offseason is approved.
                  </ThemedText>
                )}
              </ThemedView>
            );
          })}
          <ThemedView style={styles.actions}>
            <Button label="Run progression again" disabled={busy} onPress={run} />
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
  team: { gap: Spacing.one, paddingBottom: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
