import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import type { OffseasonPlan } from '@/offseason/offseason-plan';
import { planErrorText, type ArrivalStatus } from '@/offseason/offseason-plan-repository';
import { AGING_YEARS, arrivalsReady, type ParticipatingTeam } from '@/offseason/roster-changes';
import { ageAndRelease } from '@/offseason/roster-changes-repository';
import type { RosterPlayer } from '@/rosters/roster';
import { useDatabase } from '@/storage/storage-provider';

interface AgingStepProps {
  league: League;
  plan: OffseasonPlan;
  teams: ParticipatingTeam[];
  arrivals: ArrivalStatus;
  nameOf: (team: ParticipatingTeam) => string;
  refresh: () => Promise<void>;
}

const describe = (p: RosterPlayer | undefined) => (p === undefined ? 'unknown player' : `${p.name}${p.kind === 'goalie' ? ' (G)' : ''}, age ${p.age + AGING_YEARS}`);

/** Runs aging, retirement and release for every team and lists the outcome, one line per team. */
export function AgingStep({ league, plan, teams, arrivals, nameOf, refresh }: AgingStepProps) {
  const db = useDatabase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changes = plan.teamChanges ?? [];
  const ran = teams.length > 0 && teams.every((t) => changes.some((c) => c.franchiseId === t.franchiseId && c.retiredId !== undefined));
  const allProtected = teams.length > 0 && teams.every((t) => changes.some((c) => c.franchiseId === t.franchiseId));
  const ready = arrivalsReady(arrivals);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ageAndRelease(db, league);
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
      {teams.length === 0 && <ThemedText>No teams take part in the offseason.</ThemedText>}
      {teams.length > 0 && !allProtected && <ThemedText type="small">Protect one player on every team first.</ThemedText>}
      {!ready && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          Stage the arrivals first, or restage them if the linked leagues&apos; plans changed.
        </ThemedText>
      )}
      {ran &&
        teams.map((team) => {
          const change = changes.find((c) => c.franchiseId === team.franchiseId)!;
          const player = (id: string | undefined) => team.players.find((p) => p.id === id);
          return (
            <ThemedView key={team.franchiseId} style={styles.team}>
              <ThemedText type="smallBold">{nameOf(team)}</ThemedText>
              <ThemedText type="small">Retires: {describe(player(change.retiredId))}</ThemedText>
              <ThemedText type="small">Released to free agency: {describe(player(change.releasedId))}</ThemedText>
            </ThemedView>
          );
        })}
      {error !== null && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          Could not save. {error}
        </ThemedText>
      )}
      <ThemedView style={styles.actions}>
        <Button
          label={busy ? 'Working...' : ran ? 'Re-run aging, retirement and release' : 'Age, retire and release'}
          variant="primary"
          disabled={busy || !ready || !allProtected}
          onPress={run}
        />
      </ThemedView>
      {ran && <ThemedText type="small" themeColor="textSecondary">Re-running rerolls the release.</ThemedText>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  team: { gap: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
