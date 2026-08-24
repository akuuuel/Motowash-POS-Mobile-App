import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../../drizzle/migrations';
import { db } from '../db/client';
import { seedDatabase } from '../db/seeder';
import { useSettingsStore } from '../store/useSettingsStore';
import { useMasterStore } from '../store/useMasterStore';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { success: migrationSuccess, error: migrationError } = useMigrations(db, migrations);
  const [isInitializing, setIsInitializing] = useState(true);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const loadMaster = useMasterStore((state) => state.loadAll);

  useEffect(() => {
    const initializeApp = async () => {
      if (migrationSuccess) {
        try {
          // 1. Seed database jika kosong
          await seedDatabase();
          // 2. Load settings dan master data ke state store
          await Promise.all([loadSettings(), loadMaster()]);
        } catch (e) {
          console.error('Error during database initialization:', e);
        } finally {
          setIsInitializing(false);
          await SplashScreen.hideAsync();
        }
      } else if (migrationError) {
        console.error('Migration failed:', migrationError);
        setIsInitializing(false);
        await SplashScreen.hideAsync();
      }
    };

    initializeApp();
  }, [migrationSuccess, migrationError]);

  if (isInitializing || !migrationSuccess) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 15 }}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <ThemedText style={{ fontWeight: '600' }}>Inisialisasi Aplikasi...</ThemedText>
        {migrationError && (
          <ThemedText style={{ color: '#EF4444', textAlign: 'center', marginHorizontal: 20 }}>
            Error: {migrationError.message}
          </ThemedText>
        )}
      </ThemedView>
    );
  }

  return (
    <ThemeProvider value={DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
