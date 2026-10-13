import * as SplashScreen from 'expo-splash-screen';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { openDatabase } from './database';
import type { InitResult } from './init';
import { requestPersistentStorage, type PersistenceStatus } from './persistence';
import { startStorageSession, type StorageSession } from './session';
import type { Database } from './types';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

const SchemaVersionContext = createContext<number | null>(null);
const DatabaseContext = createContext<Database | null>(null);

export function useDatabase(): Database {
  const db = useContext(DatabaseContext);
  if (db === null) throw new Error('useDatabase must be used inside StorageProvider');
  return db;
}

const PersistenceContext = createContext<PersistenceStatus>('unsupported');

export function usePersistenceStatus(): PersistenceStatus {
  return useContext(PersistenceContext);
}

export function useSchemaVersion(): number {
  const version = useContext(SchemaVersionContext);
  if (version === null) throw new Error('useSchemaVersion must be used inside StorageProvider');
  return version;
}

export function StorageProvider({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<InitResult | null>(null);
  const [database, setDatabase] = useState<Database | null>(null);
  const [persistence, setPersistence] = useState<PersistenceStatus>('unsupported');

  useEffect(() => {
    let cancelled = false;
    let session: StorageSession | null = null;

    startStorageSession(openDatabase).then((started) => {
      session = started;
      if (cancelled) {
        started.close();
        return;
      }
      setDatabase(started.database);
      setResult(started.result);
      if (started.result.status === 'ready') {
        requestPersistentStorage().then((p) => !cancelled && setPersistence(p));
      }
      SplashScreen.hideAsync();
    });

    return () => {
      cancelled = true;
      session?.close();
    };
  }, [attempt]);

  if (result === null) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="textSecondary">Loading...</ThemedText>
      </ThemedView>
    );
  }

  if (result.status === 'ready') {
    return (
      <DatabaseContext.Provider value={database}>
        <SchemaVersionContext.Provider value={result.schemaVersion}>
          <PersistenceContext.Provider value={persistence}>{children}</PersistenceContext.Provider>
        </SchemaVersionContext.Provider>
      </DatabaseContext.Provider>
    );
  }

  if (result.status === 'newer-version') {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="subtitle">Data is from a newer version</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.message}>
          The saved data uses version {result.storedVersion}. Update the app to open it. Nothing was
          changed.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.center}>
      <ThemedText type="subtitle">Could not open saved data</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.message}>
        {result.error.message}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setResult(null);
          setAttempt((n) => n + 1);
        }}>
        <ThemedView type="backgroundSelected" style={styles.button}>
          <ThemedText type="smallBold">Retry</ThemedText>
        </ThemedView>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  message: { textAlign: 'center' },
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
  },
});
