import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import ColorPickerWheel, { HueSlider, Panel1 } from 'reanimated-color-picker';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { normalizeHexColor, PALETTE } from '@/teams/franchise';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function ColorPicker({ label, value, onChange, error }: ColorPickerProps) {
  const theme = useTheme();
  const current = normalizeHexColor(value);
  const [wheelOpen, setWheelOpen] = useState(false);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <ThemedView style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {PALETTE.map((hex) => {
          const selected = current === hex;
          return (
            <Pressable
              key={hex}
              accessibilityRole="radio"
              accessibilityLabel={hex}
              accessibilityState={{ selected }}
              onPress={() => onChange(hex)}
              style={[
                styles.swatch,
                { backgroundColor: hex, borderColor: selected ? Accent.primary : theme.backgroundSelected },
                selected && styles.selected,
              ]}
            />
          );
        })}
      </ThemedView>
      <ThemedView style={styles.hexRow}>
        <ThemedView
          style={[styles.preview, { backgroundColor: current ?? 'transparent', borderColor: theme.backgroundSelected }]}
        />
        <TextInput
          accessibilityLabel={`${label} hex value`}
          value={value}
          onChangeText={onChange}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={7}
          placeholder="#3c87f7"
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected },
          ]}
        />
      </ThemedView>
      <ThemedView style={styles.hexRow}>
        <Button label={wheelOpen ? 'Hide color wheel' : 'Show color wheel'} onPress={() => setWheelOpen((open) => !open)} />
      </ThemedView>
      {wheelOpen && (
        <ColorPickerWheel
          value={current ?? '#ffffff'}
          onCompleteJS={({ hex }) => onChange(hex.slice(0, 7).toLowerCase())}
          boundedThumb
          style={styles.wheel}>
          <Panel1 style={styles.panel} />
          <HueSlider style={styles.hue} />
        </ColorPickerWheel>
      )}
      {error ? (
        <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2 },
  selected: { borderWidth: 4 },
  hexRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  preview: { width: 36, height: 36, borderRadius: Spacing.two, borderWidth: 1 },
  input: {
    width: 140,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  wheel: { gap: Spacing.three, maxWidth: 320 },
  panel: { height: 180 },
  hue: { marginTop: Spacing.one },
  error: { color: Accent.danger },
});
