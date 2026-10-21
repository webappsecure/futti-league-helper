import Constants from 'expo-constants';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { usePersistenceStatus, useSchemaVersion } from '@/storage/storage-provider';

const PERSISTENCE_LABEL = {
  persistent: 'Yes',
  'not-persistent': 'No',
  unsupported: 'Not applicable on this device',
} as const;

export default function SettingsScreen() {
  const schemaVersion = useSchemaVersion();
  const persistence = usePersistenceStatus();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Settings</ThemedText>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText>App version: {Constants.expoConfig?.version ?? 'unknown'}</ThemedText>
          <ThemedText>Data schema version: {schemaVersion}</ThemedText>
          <ThemedText>Protected storage: {PERSISTENCE_LABEL[persistence]}</ThemedText>
          {persistence === 'not-persistent' && (
            <ThemedText type="small" themeColor="textSecondary">
              This browser may clear saved data. Install the site as an app if you can, and export
              backups regularly.
            </ThemedText>
          )}
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
});
