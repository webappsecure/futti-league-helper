import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import type { OffseasonPlan } from '@/offseason/offseason-plan';
import { planErrorText } from '@/offseason/offseason-plan-repository';
import { arrivalsReady, changesAreCurrent, type ParticipatingTeam } from '@/offseason/roster-changes';
import { setProtection } from '@/offseason/roster-changes-repository';
import type { ArrivalStatus } from '@/offseason/offseason-plan-repository';
import { playerLine } from '@/rosters/player-line';
import { useDatabase } from '@/storage/storage-provider';

interface ProtectionStepProps {
  league: League;
  plan: OffseasonPlan;
  teams: ParticipatingTeam[];
  arrivals: ArrivalStatus;
  /** Shows a team's name; staying teams and arrivals come from different archives. */
  nameOf: (team: ParticipatingTeam) => string;
  refresh: () => Promise<void>;
}

/** One team at a time: tap a player to protect them. */
export function ProtectionStep({ league, plan, teams, arrivals, nameOf, refresh }: ProtectionStepProps) {
  const db = useDatabase();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (teams.length === 0) return <ThemedText>No teams take part in the offseason.</ThemedText>;
  const ready = arrivalsReady(arrivals);
  const changes = plan.teamChanges ?? [];
  const team = teams[Math.min(index, teams.length - 1)];
  const position = teams.indexOf(team);
  const name = nameOf(team);
  const chosen = changes.find((c) => c.franchiseId === team.franchiseId)?.protectedId;
  const protectedCount = teams.filter((t) => changes.some((c) => c.franchiseId === t.franchiseId)).length;

  const protect = async (playerId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await setProtection(db, league, team.franchiseId, playerId);
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
      {!ready && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          Stage the arrivals first, or restage them if the linked leagues&apos; plans changed.
        </ThemedText>
      )}
      {!changesAreCurrent(changes, teams) && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          Teams changed since protections were set. Protect again.
        </ThemedText>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        Team {position + 1} of {teams.length} - protected {protectedCount} of {teams.length}
      </ThemedText>
      <ThemedText type="smallBold">{name} is on the clock</ThemedText>
      {team.players.map((p) => {
        const line = playerLine(p);
        const selected = chosen === p.id;
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={`Protect ${p.name}, ${name}`}
            accessibilityState={{ selected, disabled: busy || !ready }}
            disabled={busy || !ready}
            onPress={() => protect(p.id)}
            style={({ pressed }) => pressed && styles.dim}>
            <ThemedView type={selected ? 'backgroundSelected' : 'backgroundElement'} style={[styles.player, selected && { borderColor: Accent.primary }]}>
              <ThemedText accessibilityLabel={`${line.label}. ${line.spoken ?? line.details}${selected ? '. Protected' : ''}`}>
                {line.label}  {line.details}
                {selected ? '  - Protected' : ''}
              </ThemedText>
            </ThemedView>
          </Pressable>
        );
      })}
      {error !== null && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          Could not save. {error}
        </ThemedText>
      )}
      <ThemedView style={styles.actions}>
        <Button label="Previous team" disabled={position === 0} onPress={() => setIndex(position - 1)} />
        <Button label="Next team" disabled={position === teams.length - 1} onPress={() => setIndex(position + 1)} />
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  player: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Spacing.two, borderWidth: 2, borderColor: 'transparent' },
  dim: { opacity: 0.6 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
