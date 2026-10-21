import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Accent } from '@/constants/theme';

/** Red error text under a form field; renders nothing without text. */
export function FieldError({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
      {text}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  error: { color: Accent.danger },
});
