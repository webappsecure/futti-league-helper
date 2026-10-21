import { useState } from 'react';
import { StyleSheet, Switch, TextInput } from 'react-native';

import { FieldError } from '@/components/field-error';
import { Button, ChoiceButton } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  LEAGUE_SIZES,
  NAME_MAX_LENGTH,
  parseCount,
  validateLeagueInput,
  type FieldErrors,
  type League,
  type LeagueInput,
  type NamingStyle,
} from '@/leagues/league';
import { createLeague, updateLeague } from '@/leagues/league-repository';
import { useDatabase } from '@/storage/storage-provider';

interface LeagueFormProps {
  initial: League | null;
  onSaved: (league: League) => void;
  onCancel: () => void;
}

export function LeagueForm({ initial, onSaved, onCancel }: LeagueFormProps) {
  const db = useDatabase();
  const theme = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [size, setSize] = useState<number | null>(initial?.size ?? null);
  const [namingStyle, setNamingStyle] = useState<NamingStyle | null>(initial?.namingStyle ?? null);
  const [relegation, setRelegation] = useState(initial?.relegation ?? false);
  const [promoted, setPromoted] = useState(String(initial?.promotedCount ?? 0));
  const [demoted, setDemoted] = useState(String(initial?.demotedCount ?? 0));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected },
  ];

  const submit = async () => {
    const input: LeagueInput = {
      name,
      size,
      namingStyle,
      relegation,
      promotedCount: parseCount(promoted),
      demotedCount: parseCount(demoted),
    };
    const checked = validateLeagueInput(input);
    if (!checked.ok) {
      setErrors(checked.fields);
      setSaveError(null);
      return;
    }
    setErrors({});
    setSaveError(null);
    setSaving(true);
    const result = initial ? await updateLeague(db, initial.id, input) : await createLeague(db, input);
    setSaving(false);
    if (result.ok) {
      onSaved(result.value);
    } else if (result.error.kind === 'validation') {
      setErrors(result.error.fields);
    } else if (result.error.kind === 'not-found') {
      setSaveError('This league no longer exists.');
    } else {
      setSaveError(result.error.error.message);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">{initial ? 'Edit league' : 'New league'}</ThemedText>

      <ThemedView style={styles.field}>
        <ThemedText type="smallBold">League name</ThemedText>
        <TextInput
          accessibilityLabel="League name"
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX_LENGTH}
          placeholder="For example Premier League"
          placeholderTextColor={theme.textSecondary}
          style={inputStyle}
        />
        <FieldError text={errors.name} />
      </ThemedView>

      <ThemedView style={styles.field}>
        <ThemedText type="smallBold">Number of teams</ThemedText>
        <ThemedView style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel="Number of teams">
          {LEAGUE_SIZES.map((option) => (
            <ChoiceButton key={option} label={String(option)} selected={size === option} onPress={() => setSize(option)} />
          ))}
        </ThemedView>
        <FieldError text={errors.size} />
      </ThemedView>

      <ThemedView style={styles.field}>
        <ThemedText type="smallBold">Team names are shown as</ThemedText>
        <ThemedView style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel="Team names are shown as">
          <ChoiceButton
            label="City and team name"
            selected={namingStyle === 'cityAndName'}
            onPress={() => setNamingStyle('cityAndName')}
          />
          <ChoiceButton
            label="Team name only"
            selected={namingStyle === 'nameOnly'}
            onPress={() => setNamingStyle('nameOnly')}
          />
        </ThemedView>
        <ThemedText type="small" themeColor="textSecondary">
          Richmond Greyhounds, or AFC Richmond.
        </ThemedText>
        <FieldError text={errors.namingStyle} />
      </ThemedView>

      <ThemedView style={styles.field}>
        <ThemedView style={styles.switchRow}>
          <ThemedText type="smallBold">Promotion and relegation</ThemedText>
          <Switch
            accessibilityLabel="Promotion and relegation"
            value={relegation}
            onValueChange={setRelegation}
            trackColor={{ false: theme.textSecondary, true: Accent.primary }}
            ios_backgroundColor={theme.textSecondary}
            thumbColor="#ffffff"
          />
        </ThemedView>
        <FieldError text={errors.counts} />
      </ThemedView>

      {relegation && (
        <ThemedView style={styles.field}>
          <ThemedView style={styles.counts}>
            <ThemedView style={styles.count}>
              <ThemedText type="smallBold">Teams promoted each season</ThemedText>
              <TextInput
                accessibilityLabel="Teams promoted each season"
                value={promoted}
                onChangeText={setPromoted}
                keyboardType="number-pad"
                style={inputStyle}
              />
              <FieldError text={errors.promotedCount} />
            </ThemedView>
            <ThemedView style={styles.count}>
              <ThemedText type="smallBold">Teams demoted each season</ThemedText>
              <TextInput
                accessibilityLabel="Teams demoted each season"
                value={demoted}
                onChangeText={setDemoted}
                keyboardType="number-pad"
                style={inputStyle}
              />
              <FieldError text={errors.demotedCount} />
            </ThemedView>
          </ThemedView>
        </ThemedView>
      )}

      {saveError !== null && <FieldError text={`Could not save. ${saveError}`} />}

      <ThemedView style={styles.actions}>
        <Button label={saving ? 'Saving...' : 'Save'} variant="primary" disabled={saving} onPress={submit} />
        <Button label="Cancel" disabled={saving} onPress={onCancel} />
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  field: { gap: Spacing.two },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  count: { gap: Spacing.two, minWidth: 200, flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
