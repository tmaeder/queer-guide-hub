import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { useDiscreet } from '@/features/discreet/DiscreetGate';
import { useDiscreetSettings } from '@/features/discreet/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/**
 * Where quick exit lands: a plain scratch page with no branding, no map and
 * no queer content. It imitates no real app or brand.
 *
 * The way back is a long press on the date. If the app lock is on, that also
 * asks for Face ID / fingerprint / passcode. Nothing typed here is saved.
 */
export default function CoverScreen() {
  const { colors } = useTheme();
  const { i18n } = useTranslation();
  const { lockEnabled } = useDiscreetSettings();
  const { authenticate } = useDiscreet();
  const [text, setText] = useState('');
  const today = new Date().toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  async function leave() {
    if (lockEnabled && !(await authenticate())) return;
    router.replace('/');
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <Pressable onLongPress={leave} delayLongPress={800} accessibilityRole="header">
        <Text variant="headline">{today}</Text>
      </Pressable>
      <View style={[styles.sheet, { borderColor: colors.border }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoCorrect={false}
          style={[styles.input, { color: colors.foreground }]}
          placeholderTextColor={colors['muted-foreground']}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: space[4], gap: space[4] },
  sheet: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[2] },
  input: { flex: 1, fontSize: 17, textAlignVertical: 'top' },
});
