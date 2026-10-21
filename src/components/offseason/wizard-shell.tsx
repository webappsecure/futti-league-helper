import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { nextBlocked, nextStep, previousStep, STEP_INFO, WIZARD_STEPS, type StepStatuses, type WizardStep } from '@/offseason/wizard';

interface WizardShellProps {
  leagueName: string;
  step: WizardStep;
  statuses: StepStatuses;
  children: ReactNode;
  onGoToStep: (step: WizardStep) => void;
  onExit: () => void;
}

/** One wizard screen: where we are, the step's instruction and body, and Back and Next. */
export function WizardShell({ leagueName, step, statuses, children, onGoToStep, onExit }: WizardShellProps) {
  const info = STEP_INFO[step];
  const previous = previousStep(step);
  const next = nextStep(step);
  const blocked = nextBlocked(step, statuses);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedView style={styles.header}>
            <ThemedText type="small" themeColor="textSecondary">
              {leagueName} offseason - Step {WIZARD_STEPS.indexOf(step) + 1} of {WIZARD_STEPS.length}
            </ThemedText>
            <ThemedText type="subtitle" accessibilityRole="header">
              {info.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {info.instruction}
            </ThemedText>
          </ThemedView>
          {children}
          {blocked && (
            <ThemedText type="small" themeColor="textSecondary">
              Finish this step to continue.
            </ThemedText>
          )}
          <ThemedView style={styles.actions}>
            <Button label={previous === null ? 'Back to league' : 'Back'} onPress={previous === null ? onExit : () => onGoToStep(previous)} />
            {next !== null ? (
              <Button label="Next" variant="primary" disabled={blocked} onPress={() => onGoToStep(next)} />
            ) : (
              <Button label="Done" variant="primary" disabled={blocked} onPress={onExit} />
            )}
            {previous !== null && <Button label="Back to league" onPress={onExit} />}
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** A full-screen message with a way out, for loading, errors and unavailable states. */
export function WizardMessage({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.content}>
          {children}
          <ThemedView style={styles.actions}>{actions}</ThemedView>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { gap: Spacing.three, padding: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  header: { gap: Spacing.one },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
