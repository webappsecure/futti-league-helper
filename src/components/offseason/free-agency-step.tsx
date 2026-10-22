import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { TeamRosterPanel, type RosterRow } from '@/components/offseason/team-roster-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import { draftOrder, freeAgentPool, needsText, overLimit, pickedBy, rosterCounts, rosterNeeds, teamOnTheClock } from '@/offseason/free-agency';
import type { OffseasonPlan } from '@/offseason/offseason-plan';
import { planErrorText, type ArrivalStatus } from '@/offseason/offseason-plan-repository';
import { AGING_YEARS, arrivalsReady, type ParticipatingTeam } from '@/offseason/roster-changes';
import { makeFreeAgentPick, undoFreeAgentPick } from '@/offseason/roster-changes-repository';
import { playerLine } from '@/rosters/player-line';
import type { SeasonArchive } from '@/seasons/season-archive';
import { useDatabase } from '@/storage/storage-provider';

interface FreeAgencyStepProps {
  league: League;
  archive: SeasonArchive;
  plan: OffseasonPlan;
  teams: ParticipatingTeam[];
  arrivals: ArrivalStatus;
  nameOf: (team: ParticipatingTeam) => string;
  refresh: () => Promise<void>;
}

/** Each participating team picks one released player, one team on the clock at a time. */
export function FreeAgencyStep({ league, archive, plan, teams, arrivals, nameOf, refresh }: FreeAgencyStepProps) {
  const db = useDatabase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (teams.length === 0) return <ThemedText>No teams take part in the offseason.</ThemedText>;
  const changes = plan.teamChanges ?? [];
  const picks = plan.freeAgentPicks ?? [];
  const aged = teams.every((t) => changes.some((c) => c.franchiseId === t.franchiseId && c.releasedId !== undefined));
  if (!arrivalsReady(arrivals)) {
    return (
      <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
        Stage the arrivals first, or restage them if the linked leagues&apos; plans changed.
      </ThemedText>
    );
  }
  if (!aged) return <ThemedText>Run aging, retirement and release first.</ThemedText>;

  const sourceArchives = arrivals.sources.flatMap((s) => (s.archive === null ? [] : [s.archive]));
  const order = draftOrder(archive, plan, sourceArchives);
  const byId = (id: string) => teams.find((t) => t.franchiseId === id)!;
  const clock = teamOnTheClock(order, picks);
  const pool = freeAgentPool(teams, changes, picks);
  const allPlayers = teams.flatMap((t) => t.players);
  const playerName = (id: string) => allPlayers.find((p) => p.id === id)?.name ?? 'unknown player';
  const over = order.flatMap((id) => {
    const team = byId(id);
    const counts = rosterCounts(team, changes.find((c) => c.franchiseId === id), pickedBy(id, teams, picks));
    return overLimit(counts) ? [`${nameOf(team)} has ${counts.standard} position players and ${counts.goalies} goaltenders; fix this by hand before approval.`] : [];
  });

  const rosterRows = (id: string): RosterRow[] => {
    const team = byId(id);
    const change = changes.find((c) => c.franchiseId === id);
    const kept = team.players
      .filter((p) => p.id !== change?.retiredId && p.id !== change?.releasedId)
      .map((player): RosterRow => ({ player, ageBy: AGING_YEARS, note: player.id === change?.protectedId ? 'protected' : undefined }));
    const picked = pickedBy(id, teams, picks).map((player): RosterRow => ({ player, ageBy: AGING_YEARS, note: 'free agent pick' }));
    return [...kept, ...picked];
  };

  const run = async (action: () => ReturnType<typeof makeFreeAgentPick>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.ok) await refresh();
      else setError(planErrorText(result.error, league));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const clockName = clock === null ? '' : nameOf(byId(clock));
  const row = ({ player, fromFranchiseId }: (typeof pool)[number]) => {
    const line = playerLine(player);
    const details = line.details.replace(`Age ${player.age}`, `Age ${player.age + AGING_YEARS}`);
    const own = fromFranchiseId === clock;
    const from = own ? 'released by this team' : `released by ${nameOf(byId(fromFranchiseId))}`;
    return (
      <Pressable
        key={player.id}
        accessibilityRole="button"
        accessibilityLabel={`Pick ${player.name}, ${clockName}`}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => run(() => makeFreeAgentPick(db, league, player.id))}
        style={({ pressed }) => pressed && styles.dim}>
        <ThemedView type="backgroundElement" style={styles.player}>
          <ThemedText accessibilityLabel={`${line.label}. ${line.spoken ?? details}. ${from}`}>
            {line.label}  {details}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {from}
          </ThemedText>
        </ThemedView>
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.body}>
      {clock !== null ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Pick {picks.length + 1} of {order.length}
          </ThemedText>
          <ThemedText type="smallBold">{nameOf(byId(clock))} is on the clock</ThemedText>
          <ThemedText type="small">
            Needs: {needsText(rosterNeeds(rosterCounts(byId(clock), changes.find((c) => c.franchiseId === clock), pickedBy(clock, teams, picks))))}
          </ThemedText>
          <TeamRosterPanel key={clock} teamName={nameOf(byId(clock))} rows={rosterRows(clock)} />
          <ThemedText type="smallBold">Position players</ThemedText>
          {pool.filter((e) => e.player.kind === 'standard').map(row)}
          <ThemedText type="smallBold">Goaltenders</ThemedText>
          {pool.filter((e) => e.player.kind === 'goalie').map(row)}
        </>
      ) : (
        <>
          <ThemedText type="smallBold">The draft is complete</ThemedText>
          {over.length === 0 ? (
            <ThemedText type="small">No team is over the roster limit.</ThemedText>
          ) : (
            over.map((line) => (
              <ThemedText key={line} type="small" accessibilityRole="alert" style={styles.error}>
                {line}
              </ThemedText>
            ))
          )}
        </>
      )}
      {picks.length > 0 && (
        <ThemedView style={styles.picks}>
          <ThemedText type="smallBold">Picks so far</ThemedText>
          {picks.map((pick, i) => (
            <ThemedText key={pick.playerId} type="small">
              {i + 1}. {nameOf(byId(pick.franchiseId))} picked {playerName(pick.playerId)}
            </ThemedText>
          ))}
        </ThemedView>
      )}
      {error !== null && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          Could not save. {error}
        </ThemedText>
      )}
      {picks.length > 0 && (
        <ThemedView style={styles.actions}>
          <Button label="Undo last pick" disabled={busy} onPress={() => run(() => undoFreeAgentPick(db, league))} />
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  player: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Spacing.two },
  picks: { gap: Spacing.one, paddingTop: Spacing.two },
  dim: { opacity: 0.6 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
