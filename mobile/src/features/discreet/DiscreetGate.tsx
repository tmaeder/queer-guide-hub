import { useQueryClient } from '@tanstack/react-query';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { Button, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { shouldLockOnResume } from './lockPolicy';
import { discreetSettings, useDiscreetSettings } from './settings';

type Discreet = {
  /** Wipe in-memory data and jump to the neutral cover screen. */
  quickExit: () => void;
  /** Prompt for Face ID / fingerprint / passcode. Resolves true on success. */
  authenticate: () => Promise<boolean>;
};

const DiscreetContext = createContext<Discreet>({
  quickExit: () => {},
  authenticate: async () => true,
});

export const useDiscreet = () => useContext(DiscreetContext);

export function DiscreetGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const settings = useDiscreetSettings();
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState(discreetSettings.isLoaded());
  const [locked, setLocked] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  // Decide lock state before ANY content renders, so a locked app never
  // flashes its last screen on cold start.
  useEffect(() => {
    let cancelled = false;
    void discreetSettings.load().then(() => {
      if (cancelled) return;
      const s = discreetSettings.get();
      setLocked(shouldLockOnResume({ ...s, enabled: s.lockEnabled, backgroundedAt: null, now: Date.now() }));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active') {
        const s = discreetSettings.get();
        if (
          backgroundedAt.current != null &&
          shouldLockOnResume({
            enabled: s.lockEnabled,
            lockAfterMs: s.lockAfterMs,
            backgroundedAt: backgroundedAt.current,
            now: Date.now(),
          })
        ) {
          setLocked(true);
        }
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  // App-switcher protection. iOS: blur overlay. Android: FLAG_SECURE, which
  // also blocks screenshots — the settings copy says so.
  useEffect(() => {
    if (!loaded) return;
    const run = async () => {
      if (Platform.OS === 'ios') {
        if (settings.hideInSwitcher) await ScreenCapture.enableAppSwitcherProtectionAsync(1);
        else await ScreenCapture.disableAppSwitcherProtectionAsync();
      } else if (settings.hideInSwitcher) {
        await ScreenCapture.preventScreenCaptureAsync('discreet');
      } else {
        await ScreenCapture.allowScreenCaptureAsync('discreet');
      }
    };
    run().catch(() => {});
  }, [loaded, settings.hideInSwitcher]);

  const authenticate = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t('discreet.unlockPrompt'),
      // Allow the device passcode, so a failed Face ID never locks someone out.
      disableDeviceFallback: false,
    });
    return result.success;
  }, [t]);

  const unlock = useCallback(async () => {
    if (await authenticate()) setLocked(false);
  }, [authenticate]);

  const quickExit = useCallback(() => {
    // Drop every cached venue/hotline from memory before showing the cover.
    queryClient.clear();
    router.replace('/cover');
  }, [queryClient]);

  // Until the lock decision is made, and while locked, an opaque cover sits
  // over the app. The navigator stays mounted (Expo Router needs its root
  // navigator for deep links), but the content beneath is hidden from screen
  // readers too, not just visually.
  const covered = !loaded || locked;

  return (
    <DiscreetContext.Provider value={{ quickExit, authenticate }}>
      <View
        style={styles.fill}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {covered ? (
        <View style={StyleSheet.absoluteFill}>
          {locked ? <LockScreen onUnlock={unlock} /> : <BlankCover />}
        </View>
      ) : null}
    </DiscreetContext.Provider>
  );
}

function BlankCover() {
  const { colors } = useTheme();
  return <View style={[styles.fill, { backgroundColor: colors.background }]} />;
}

/** Deliberately unbranded: an onlooker sees a lock screen, not "queer.guide". */
function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  useEffect(() => {
    onUnlock(); // prompt immediately; the button is the retry
  }, [onUnlock]);
  return (
    <View style={[styles.lock, { backgroundColor: colors.background }]}>
      <Text variant="title">{t('discreet.locked')}</Text>
      <Button label={t('discreet.unlock')} onPress={onUnlock} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  lock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[6], padding: space[8] },
});
