import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';

import { isTwoPane } from './master-detail-layout';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';

interface MasterDetailProps {
  master: ReactNode;
  detail: ReactNode;
  showDetail?: boolean;
}

export function MasterDetail({ master, detail, showDetail = false }: MasterDetailProps) {
  const { width } = useWindowDimensions();

  if (!isTwoPane(width)) {
    return <ThemedView style={styles.single}>{showDetail ? detail : master}</ThemedView>;
  }

  return (
    <ThemedView style={styles.row}>
      <ThemedView type="backgroundElement" style={styles.master}>
        {master}
      </ThemedView>
      <ThemedView style={styles.detail}>{detail}</ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  single: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  master: { width: 320, padding: Spacing.three },
  detail: { flex: 1, padding: Spacing.three },
});
