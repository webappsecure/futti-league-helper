import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Button, ChoiceButton } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { League } from '@/leagues/league';
import { GRADES } from '@/rules/charts';
import { useDatabase } from '@/storage/storage-provider';
import {
  TEAM_TEXT_MAX_LENGTH,
  validateFranchiseInput,
  type Franchise,
  type FranchiseFieldErrors,
  type FranchiseInput,
} from '@/teams/franchise';
import { createFranchise, updateFranchise } from '@/teams/franchise-repository';
import { ColorPicker } from './color-picker';

interface TeamFormProps {
  league: League;
  initial: Franchise | null;
  onSaved: () => void;
  onCancel: () => void;
}

function FieldError({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
      {text}
    </ThemedText>
  );
}

export function TeamForm({ league, initial, onSaved, onCancel }: TeamFormProps) {
  const db = useDatabase();
  const theme = useTheme();
  const first = initial?.identities[0];
  const [city, setCity] = useState(first?.city ?? '');
  const [name, setName] = useState(first?.name ?? '');
  const [primary, setPrimary] = useState(first?.primaryColor ?? '');
  const [secondary, setSecondary] = useState(first?.secondaryColor ?? '');
  const [grade, setGrade] = useState<string | null>(initial?.initialGrade ?? null);
  const [errors, setErrors] = useState<FranchiseFieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected },
  ];

  const submit = async () => {
    const input: FranchiseInput = {
      city,
      name,
      primaryColor: primary,
      secondaryColor: secondary,
      initialGrade: grade,
    };
    const checked = validateFranchiseInput(input);
    if (!checked.ok) {
      setErrors(checked.fields);
      setSaveError(null);
      return;
    }
    setErrors({});
    setSaveError(null);
    setSaving(true);
    const result = initial
      ? await updateFranchise(db, league, initial.id, input)
      : await createFranchise(db, league, input);
    setSaving(false);
    if (result.ok) {
      onSaved();
    } else if (result.error.kind === 'validation') {
      setErrors(result.error.fields);
    } else if (result.error.kind === 'full') {
      setSaveError(`This league already has ${league.size} teams.`);
    } else if (result.error.kind === 'not-found') {
      setSaveError('This team no longer exists.');
    } else {
      setSaveError(result.error.error.message);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">{initial ? 'Edit team' : 'New team'}</ThemedText>

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

      <ThemedView style={styles.field}>
        <ThemedText type="smallBold">Initial grade</ThemedText>
        <ThemedView style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel="Initial grade">
          {GRADES.map((option) => (
            <ChoiceButton key={option} label={option} selected={grade === option} onPress={() => setGrade(option)} />
          ))}
        </ThemedView>
        <ThemedText type="small" themeColor="textSecondary">
          A is the strongest team, F the weakest. Used only when the roster is generated.
        </ThemedText>
        <FieldError text={errors.initialGrade} />
      </ThemedView>

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
  actions: { flexDirection: 'row', gap: Spacing.two },
  error: { color: Accent.danger },
});
