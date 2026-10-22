import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { TeamRosterPanel, type RosterRow } from '@/components/offseason/team-roster-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import { needsText, pickedBy } from '@/offseason/free-agency';
import type { OffseasonPlan } from '@/offseason/offseason-plan';
import { planErrorText, type ArrivalStatus } from '@/offseason/offseason-plan-repository';
import { AGING_YEARS, arrivalsReady, type ParticipatingTeam } from '@/offseason/roster-changes';
import { generateDraftPool, makeRookiePick, undoRookiePick } from '@/offseason/rookie-draft-repository';
import { EXTRA_GOALIES, EXTRA_STANDARD, freeAgencyComplete, poolSize, rookieDraftOrder, rookiesPickedBy, rookieOnTheClock, rookiePool, teamNeeds } from '@/offseason/rookie-draft';
import { playerLine } from '@/rosters/player-line';
import type { RosterPlayer } from '@/rosters/roster';
import type { SeasonArchive } from '@/seasons/season-archive';
import { useDatabase } from '@/storage/storage-provider';

interface RookieDraftStepProps {
  league: League;
  archive: SeasonArchive;
  plan: OffseasonPlan;
  teams: ParticipatingTeam[];
  arrivals: ArrivalStatus;
  nameOf: (team: ParticipatingTeam) => string;
  refresh: () => Promise<void>;
}

/** The dice behind a draftee's ratings, for example "age 7, total 9, split 3, stars 8, SP 5". */
function diceText(player: RosterPlayer): string {
  if (player.kind === 'goalie') return `Dice: age ${player.rolls.age}, GO ${player.rolls.goaltending}, SP ${player.rolls.sportsmanship}`;
  const r = player.rolls;
  return `Dice: age ${r.age}, total ${r.total}${r.split === null ? '' : `, split ${r.split}`}, stars ${r.stars}, SP ${r.sportsmanship}`;
}

/** Generates the draft pool, then each team that still needs players picks, one team on the clock at a time. */
export function RookieDraftStep({ league, archive, plan, teams, arrivals, nameOf, refresh }: RookieDraftStepProps) {
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

  const sourceArchives = arrivals.sources.flatMap((s) => (s.archive === null ? [] : [s.archive]));
  const order = rookieDraftOrder(archive, plan, sourceArchives);
  const byId = (id: string) => teams.find((t) => t.franchiseId === id)!;
  const picks = plan.draftPicks ?? [];
  const pool = plan.draftPool === undefined ? null : rookiePool(plan);
  const clock = pool === null ? null : rookieOnTheClock(order, teams, plan);
  const size = poolSize(teams.map((t) => teamNeeds(t, teams, plan)));
  const needsLines = order.map((id) => `${nameOf(byId(id))}: ${needsText(teamNeeds(byId(id), teams, plan))}`);
  const playerName = (id: string) => (plan.draftPool ?? []).find((p) => p.id === id)?.name ?? 'unknown player';

  const rosterRows = (id: string): RosterRow[] => {
    const team = byId(id);
    const change = (plan.teamChanges ?? []).find((c) => c.franchiseId === id);
    const kept = team.players
      .filter((p) => p.id !== change?.retiredId && p.id !== change?.releasedId)
      .map((player): RosterRow => ({ player, ageBy: AGING_YEARS, note: player.id === change?.protectedId ? 'protected' : undefined }));
    const free = pickedBy(id, teams, plan.freeAgentPicks ?? []).map((player): RosterRow => ({ player, ageBy: AGING_YEARS, note: 'free agent pick' }));
    const rookies = rookiesPickedBy(id, plan).map((player): RosterRow => ({ player, ageBy: 0, note: 'rookie' }));
    return [...kept, ...free, ...rookies];
  };

  const run = async (action: () => ReturnType<typeof makeRookiePick>) => {
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

  const row = (player: RosterPlayer) => {
    const line = playerLine(player);
    const needs = clock === null ? null : teamNeeds(byId(clock), teams, plan);
    const wanted = needs !== null && (player.kind === 'goalie' ? needs.goalies : needs.standard) > 0;
    const disabled = busy || clock === null || !wanted;
    const clockName = clock === null ? '' : nameOf(byId(clock));
    return (
      <Pressable
        key={player.id}
        accessibilityRole="button"
        accessibilityLabel={`Draft ${player.name}, ${clockName}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => run(() => makeRookiePick(db, league, player.id))}
        style={({ pressed }) => (pressed || (disabled && clock !== null)) && styles.dim}>
        <ThemedView type="backgroundElement" style={styles.player}>
          <ThemedText accessibilityLabel={`${line.label}. ${line.spoken ?? line.details}. ${diceText(player)}`}>
            {line.label}  {line.details}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {diceText(player)}
          </ThemedText>
        </ThemedView>
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.body}>
      {pool === null ? (
        <>
          <ThemedText type="smallBold">Teams still need</ThemedText>
          {needsLines.map((line) => (
            <ThemedText key={line} type="small">
              {line}
            </ThemedText>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            The pool will hold {size.standard} position players and {size.goalies} goaltenders: what the teams need plus {EXTRA_STANDARD} extra position players and {EXTRA_GOALIES} extra goaltender.
          </ThemedText>
          <ThemedView style={styles.actions}>
            <Button label="Generate draft pool" variant="primary" disabled={busy} onPress={() => run(() => generateDraftPool(db, league))} />
          </ThemedView>
        </>
      ) : clock !== null ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Pick {picks.length + 1} of {picks.length + order.reduce((n, id) => n + teamNeedTotal(byId(id), teams, plan), 0)}
          </ThemedText>
          <ThemedText type="smallBold">{nameOf(byId(clock))} is on the clock</ThemedText>
          <ThemedText type="small">Needs: {needsText(teamNeeds(byId(clock), teams, plan))}</ThemedText>
          <TeamRosterPanel key={clock} teamName={nameOf(byId(clock))} rows={rosterRows(clock)} />
          <ThemedText type="smallBold">Position players</ThemedText>
          {pool.filter((p) => p.kind === 'standard').map(row)}
          <ThemedText type="smallBold">Goaltenders</ThemedText>
          {pool.filter((p) => p.kind === 'goalie').map(row)}
        </>
      ) : (
        <>
          <ThemedText type="smallBold">The rookie draft is complete</ThemedText>
          <ThemedText type="small">
            {pool.length === 0 ? 'Every draftee was picked.' : `${pool.length} ${pool.length === 1 ? 'draftee stays' : 'draftees stay'} undrafted and will be discarded when the offseason is approved.`}
          </ThemedText>
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
      <ThemedView style={styles.actions}>
        {picks.length > 0 && <Button label="Undo last pick" disabled={busy} onPress={() => run(() => undoRookiePick(db, league))} />}
        {pool !== null && picks.length === 0 && <Button label="Regenerate pool" disabled={busy} onPress={() => run(() => generateDraftPool(db, league))} />}
      </ThemedView>
    </ThemedView>
  );
}

const teamNeedTotal = (team: ParticipatingTeam, teams: readonly ParticipatingTeam[], plan: OffseasonPlan): number => {
  const n = teamNeeds(team, teams, plan);
  return n.standard + n.goalies;
};

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  player: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Spacing.two },
  picks: { gap: Spacing.one, paddingTop: Spacing.two },
  dim: { opacity: 0.6 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
