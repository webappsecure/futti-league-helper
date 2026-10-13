import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { MasterDetail } from '@/components/master-detail';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, TopTabInset, Spacing } from '@/constants/theme';

export default function LeaguesScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <MasterDetail
          master={
            <>
              <ThemedText type="subtitle">Leagues</ThemedText>
              <ThemedText themeColor="textSecondary">No leagues yet</ThemedText>
            </>
          }
          detail={
            <ThemedText themeColor="textSecondary">
              Create a league to get started. Leagues, teams and rosters will appear here.
            </ThemedText>
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingTop: TopTabInset,
    paddingBottom: BottomTabInset + Spacing.three },
});
