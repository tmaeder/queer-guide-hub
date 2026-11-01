import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { resetCacheOnUserChange } from '@/features/auth/cacheReset';
import { DiscreetGate } from '@/features/discreet/DiscreetGate';
import { packDb } from '@/features/packs/db';
import { savedStore } from '@/features/saved/savedStore';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function RootStack() {
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTintColor: colors.foreground,
          headerStyle: { backgroundColor: colors.background },
          contentStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ title: t('search.title') }} />
        <Stack.Screen name="auth" options={{ presentation: 'modal', title: t('auth.signIn') }} />
        <Stack.Screen name="account/delete" options={{ title: t('account.deleteTitle') }} />
        <Stack.Screen name="venues/[slug]" options={{ title: '', headerTransparent: false }} />
        <Stack.Screen name="cover" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="+not-found" options={{ title: t('venue.notFound') }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false } },
      }),
  );

  // Gated content differs per user: drop the cache whenever the user changes.
  useEffect(() => resetCacheOnUserChange(queryClient), [queryClient]);

  useEffect(() => {
    void savedStore.load();
    // Opens the offline pack store so reads can fall back to it.
    void packDb();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <DiscreetGate>
            <RootStack />
          </DiscreetGate>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
