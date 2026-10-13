import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Accent, Spacing } from '@/constants/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function Button({ label, onPress, variant = 'secondary', disabled = false, accessibilityLabel }: ButtonProps) {
  const filled = variant !== 'secondary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => (pressed || disabled) && styles.dim}>
      <ThemedView
        type="backgroundSelected"
        style={[
          styles.button,
          variant === 'primary' && { backgroundColor: Accent.primary },
          variant === 'danger' && { backgroundColor: Accent.danger },
        ]}>
        <ThemedText type="smallBold" style={filled && styles.onFill}>
          {label}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

interface ChoiceButtonProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function ChoiceButton({ label, selected, onPress }: ChoiceButtonProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.dim}>
      <ThemedView
        type={selected ? 'backgroundSelected' : 'backgroundElement'}
        style={[styles.choice, selected && { borderColor: Accent.primary }]}>
        <ThemedText type="smallBold">{label}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  choice: {
    minWidth: 48,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  onFill: { color: '#ffffff' },
  dim: { opacity: 0.6 },
});
