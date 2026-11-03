import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { useDiscreet } from './DiscreetGate';
import { useDiscreetSettings } from './settings';

/** Renders nothing unless the user turned quick exit on. */
export function QuickExitButton() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { quickExit } = useDiscreetSettings();
  const discreet = useDiscreet();
  if (!quickExit) return null;
  return (
    <Pressable
      onPress={discreet.quickExit}
      accessibilityRole="button"
      accessibilityLabel={t('discreet.quickExit')}
      hitSlop={12}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.foreground, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text variant="small" style={{ color: colors.background, fontWeight: '700' }}>
        {t('discreet.quickExit')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: space[4],
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
