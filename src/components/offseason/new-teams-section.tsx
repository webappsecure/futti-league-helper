import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { FieldError } from '@/components/field-error';
import { Button, ChoiceButton } from '@/components/button';
import { ColorPicker } from '@/components/teams/color-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { League } from '@/leagues/league';
import { newTeamsFit, openVacancies } from '@/offseason/new-teams';
import type { OffseasonPlan, StagedNewTeam } from '@/offseason/offseason-plan';
import { addNewTeam, planErrorText, removeNewTeam, rerollNewTeam } from '@/offseason/offseason-plan-repository';
import type { useArrivalStatus } from '@/offseason/use-arrival-status';
import { playerLine } from '@/rosters/player-line';
import { useDatabase } from '@/storage/storage-provider';
import { TEAM_TEXT_MAX_LENGTH, type IdentityFieldErrors } from '@/teams/franchise';

type Side = StagedNewTeam['vacancy'];

const SIDE_TEXT: Record<Side, string> = {
  promoted: 'replacing a promoted team',
  demoted: 'replacing a demoted team',
};

interface NewTeamsSectionProps {
  league: League;
  /** This league's saved plan, or null until its departures are saved. */
  plan: OffseasonPlan | null;
  /** Supplies whether a linked league sits above or below. */
  arrivals: ReturnType<typeof useArrivalStatus>;
  /** Reloads the plan and arrivals after a change. */
  refresh: () => Promise<void>;
}

/** Newly created teams for the places linked leagues do not fill. */
export function NewTeamsSection({ league, plan, arrivals, refresh }: NewTeamsSectionProps) {
  const db = useDatabase();
  const theme = useTheme();
  const [city, setCity] = useState('');
  const [name, setName] = useState('');
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [side, setSide] = useState<Side | null>(null);
  const [errors, setErrors] = useState<IdentityFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (arrivals.state.status !== 'ready') return null;
  const links = { hasAbove: arrivals.state.arrivals.hasAbove, hasBelow: arrivals.state.arrivals.hasBelow };

  if (plan === null) {
    return (
      <ThemedView style={styles.section}>
          <ThemedText type="small">Save this league&apos;s plan above before adding new teams.</ThemedText>
      </ThemedView>
    );
  }

  const open = openVacancies(plan, links);
  const staged = plan.newTeams ?? [];
  const sides = (['promoted', 'demoted'] as const).filter((s) => open[s] > 0);
  const chosen: Side | null = side !== null && sides.includes(side) ? side : (sides[0] ?? null);
  const fits = newTeamsFit(plan, links);

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected }];

  const run = async (action: () => Promise<{ ok: true } | { ok: false; message: string; fields?: IdentityFieldErrors }>, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.ok) {
        await refresh();
        after?.();
      } else if (result.fields !== undefined) {
        setErrors(result.fields);
      } else {
        setError(result.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    if (chosen === null) return;
    setErrors({});
    return run(
      async () => {
        const r = await addNewTeam(db, league, { city, name, primaryColor: primary, secondaryColor: secondary }, chosen);
        if (r.ok) return { ok: true };
        return r.error.kind === 'validation'
          ? { ok: false, message: planErrorText(r.error, league), fields: r.error.fields }
          : { ok: false, message: planErrorText(r.error, league) };
      },
      () => {
        setCity('');
        setName('');
        setPrimary('');
        setSecondary('');
      },
    );
  };

  const change = (action: () => ReturnType<typeof rerollNewTeam>) =>
    run(async () => {
      const r = await action();
      return r.ok ? { ok: true } : { ok: false, message: planErrorText(r.error, league) };
    });

  return (
    <ThemedView style={styles.section}>
      <ThemedText type="small" themeColor="textSecondary">
        Places a linked league does not fill can go to newly created teams. The grade is rolled and the roster generated. Nothing changes until the offseason is approved.
      </ThemedText>
      <ThemedText type="small">
        {open.promoted + open.demoted === 0
          ? 'No open places.'
          : `Open places: ${[open.promoted > 0 ? `${open.promoted} ${SIDE_TEXT.promoted}` : null, open.demoted > 0 ? `${open.demoted} ${SIDE_TEXT.demoted}` : null].filter(Boolean).join(', ')}.`}
      </ThemedText>
      {!fits && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          More new teams are staged than there are open places now. Remove the extras.
        </ThemedText>
      )}

      {chosen !== null && (
        <ThemedView style={styles.form}>
          {sides.length > 1 && (
            <ThemedView style={styles.field}>
              <ThemedText type="smallBold">Place</ThemedText>
              <ThemedView style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel="Place for the new team">
                {sides.map((s) => (
                  <ChoiceButton key={s} label={SIDE_TEXT[s]} selected={chosen === s} onPress={() => setSide(s)} />
                ))}
              </ThemedView>
            </ThemedView>
          )}
          <ThemedView style={styles.field}>
            <ThemedText type="smallBold">City</ThemedText>
            <TextInput
              accessibilityLabel="City"
              value={city}
              onChangeText={setCity}
              maxLength={TEAM_TEXT_MAX_LENGTH}
              placeholder="For example Richmond"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
            />
            <FieldError text={errors.city} />
          </ThemedView>
          <ThemedView style={styles.field}>
            <ThemedText type="smallBold">Team name</ThemedText>
            <TextInput
              accessibilityLabel="Team name"
              value={name}
              onChangeText={setName}
              maxLength={TEAM_TEXT_MAX_LENGTH}
              placeholder={league.namingStyle === 'nameOnly' ? 'For example AFC Richmond' : 'For example Greyhounds'}
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
            />
            <FieldError text={errors.name} />
          </ThemedView>
          <ColorPicker label="Primary color" value={primary} onChange={setPrimary} error={errors.primaryColor} />
          <ColorPicker label="Secondary color" value={secondary} onChange={setSecondary} error={errors.secondaryColor} />
          <ThemedView style={styles.actions}>
            <Button label={busy ? 'Adding...' : 'Add team'} variant="primary" disabled={busy} onPress={add} />
          </ThemedView>
        </ThemedView>
      )}

      {error !== null && (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          Could not save. {error}
        </ThemedText>
      )}

      {staged.map((team) => (
        <ThemedView key={team.id} style={styles.team}>
          <ThemedText type="smallBold">
            {league.namingStyle === 'cityAndName' ? `${team.city} ${team.name}` : team.name}
          </ThemedText>
          <ThemedText type="small">
            {SIDE_TEXT[team.vacancy]}. Rolled {team.gradeRoll}: grade {team.grade}
          </ThemedText>
          {team.players.map((p) => {
            const line = playerLine(p);
            return (
              <ThemedText key={p.id} type="small" accessibilityLabel={`${line.label}. ${line.spoken ?? line.details}`}>
                {line.label}  {line.details}
              </ThemedText>
            );
          })}
          <ThemedView style={styles.actions}>
            <Button label="Reroll team" disabled={busy} onPress={() => change(() => rerollNewTeam(db, league, team.id))} />
            <Button label="Remove" variant="danger" disabled={busy} onPress={() => change(() => removeNewTeam(db, league, team.id))} />
          </ThemedView>
        </ThemedView>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two, paddingTop: Spacing.two },
  form: { gap: Spacing.three },
  field: { gap: Spacing.two },
  team: { gap: Spacing.one, paddingVertical: Spacing.two },
  input: { borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, fontSize: 16 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
