import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import type { League } from '@/leagues/league';
import { suggestDepartures, validateDepartures, departureErrorText, type OffseasonPlan } from '@/offseason/offseason-plan';
import { planErrorText, saveOffseasonPlan } from '@/offseason/offseason-plan-repository';
import { useOffseasonPlan } from '@/offseason/use-offseason-plan';
import type { Season } from '@/seasons/season';
import type { SeasonArchive } from '@/seasons/season-archive';
import { useSeasonArchive } from '@/seasons/use-season-archive';
import { useDatabase } from '@/storage/storage-provider';
import { displayName } from '@/teams/franchise';

interface OffseasonCardProps {
  league: League;
  season: Season;
}

/** Choosing which teams leave the league this offseason. Only shown for a relegation league whose season has ended. */
export function OffseasonCard({ league, season }: OffseasonCardProps) {
  const archive = useSeasonArchive(season.id, season.status);
  const plan = useOffseasonPlan(season.id);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Offseason: promotion and relegation</ThemedText>
      {(archive.state.status === 'loading' || plan.state.status === 'loading') && <ThemedText type="small">Loading...</ThemedText>}
      {(archive.state.status === 'error' || plan.state.status === 'error') && (
        <>
          <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
            Could not load the offseason. {archive.state.status === 'error' ? archive.state.message : plan.state.status === 'error' ? plan.state.message : ''}
          </ThemedText>
          <ThemedView style={styles.actions}>
            <Button
              label="Retry"
              onPress={() => {
                archive.retry();
                plan.retry();
              }}
            />
          </ThemedView>
        </>
      )}
      {archive.state.status === 'ready' && plan.state.status === 'ready' && archive.state.archive === null && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          The saved results for this season could not be found.
        </ThemedText>
      )}
      {archive.state.status === 'ready' && plan.state.status === 'ready' && archive.state.archive !== null && (
        <PlanEditor league={league} season={season} archive={archive.state.archive} saved={plan.state.plan} refresh={plan.refresh} />
      )}
    </ThemedView>
  );
}

interface PlanEditorProps {
  league: League;
  season: Season;
  archive: SeasonArchive;
  saved: OffseasonPlan | null;
  refresh: () => Promise<void>;
}

function PlanEditor({ league, season, archive, saved, refresh }: PlanEditorProps) {
  const db = useDatabase();
  const [initial] = useState(() => saved ?? suggestDepartures(archive, league));
  const [promoted, setPromoted] = useState<string[]>(initial.promoted);
  const [demoted, setDemoted] = useState<string[]>(initial.demoted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const checked = validateDepartures({ archive, league, promoted, demoted });
  const invalid = checked.ok ? null : departureErrorText(checked.error, league);

  const toggle = (id: string, list: 'promoted' | 'demoted') => {
    setJustSaved(false);
    setError(null);
    const [mine, setMine, other, setOther] =
      list === 'promoted' ? [promoted, setPromoted, demoted, setDemoted] : [demoted, setDemoted, promoted, setPromoted];
    setMine(mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id]);
    setOther(other.filter((x) => x !== id));
  };

  const save = async () => {
    if (busy || !checked.ok) return;
    setBusy(true);
    setError(null);
    try {
      const result = await saveOffseasonPlan(db, league, promoted, demoted);
      if (result.ok) {
        await refresh();
        setJustSaved(true);
      } else {
        setError(planErrorText(result.error, league));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        {saved === null
          ? 'Suggested from the finishing order. Change who goes up or down, then save the plan.'
          : 'Your saved plan. Change who goes up or down, then save again.'}{' '}
        Nothing changes until the offseason is approved.
      </ThemedText>
      <ThemedText type="small">
        Promoted {promoted.length} of {league.promotedCount}, demoted {demoted.length} of {league.demotedCount}
      </ThemedText>
      <ThemedView style={styles.list}>
        {archive.teams.map((team) => {
          const name = displayName(team.identity, league.namingStyle);
          return (
            <ThemedView key={team.franchiseId} style={styles.row}>
              <ThemedText style={styles.position}>{team.position}.</ThemedText>
              <ThemedText style={styles.team}>{name}</ThemedText>
              <Toggle label="Promote" name={name} selected={promoted.includes(team.franchiseId)} disabled={busy} onPress={() => toggle(team.franchiseId, 'promoted')} />
              <Toggle label="Demote" name={name} selected={demoted.includes(team.franchiseId)} disabled={busy} onPress={() => toggle(team.franchiseId, 'demoted')} />
            </ThemedView>
          );
        })}
      </ThemedView>
      {invalid !== null && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          {invalid}
        </ThemedText>
      )}
      {error !== null && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          Could not save. {error}
        </ThemedText>
      )}
      {justSaved && invalid === null && error === null && (
        <ThemedText type="small" accessibilityRole="alert">
          Plan saved. Teams and rosters are unchanged until the offseason is approved.
        </ThemedText>
      )}
      <ThemedView style={styles.actions}>
        <Button label={busy ? 'Saving...' : 'Save plan'} variant="primary" disabled={busy || !checked.ok} onPress={save} />
      </ThemedView>
    </>
  );
}

function Toggle({ label, name, selected, disabled, onPress }: { label: string; name: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${name}`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.dim}>
      <ThemedView type={selected ? 'backgroundSelected' : 'background'} style={[styles.toggle, selected && { borderColor: Accent.primary }]}>
        <ThemedText type="smallBold">{label}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  list: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  position: { width: 28 },
  team: { flex: 1 },
  toggle: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Spacing.two, borderWidth: 2, borderColor: 'transparent' },
  dim: { opacity: 0.6 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
