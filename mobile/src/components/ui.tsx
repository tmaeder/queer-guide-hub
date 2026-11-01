import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  type PressableProps,
  type TextProps,
} from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, text } from '@/theme/tokens';

type Variant = keyof typeof text;

export function Text({
  variant = 'body',
  muted,
  style,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean }) {
  const { colors } = useTheme();
  return (
    <RNText
      // Respect the user's font size: never disable font scaling.
      allowFontScaling
      style={[
        {
          color: muted ? colors['muted-foreground'] : colors.foreground,
          fontSize: text[variant],
          fontWeight: variant === 'body' || variant === 'small' ? '400' : '700',
          letterSpacing: variant === 'eyebrow' ? 0.8 : undefined,
          textTransform: variant === 'eyebrow' ? 'uppercase' : undefined,
        },
        style,
      ]}
      {...rest}
    />
  );
}

export function Card({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  tone = 'primary',
  ...rest
}: PressableProps & { label: string; tone?: 'primary' | 'secondary' }) {
  const { colors } = useTheme();
  const primary = tone === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? colors.primary : 'transparent',
          borderColor: colors.foreground,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      {...rest}
    >
      <Text
        variant="small"
        style={{ color: primary ? colors['primary-foreground'] : colors.foreground, fontWeight: '700' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Loading / error / empty — every list state is designed, never a blank screen. */
export function StateMessage({
  kind,
  message,
  action,
}: {
  kind: 'loading' | 'error' | 'empty';
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.state} accessibilityLiveRegion="polite">
      {kind === 'loading' ? <ActivityIndicator /> : null}
      <Text muted style={{ textAlign: 'center' }}>
        {message}
      </Text>
      {action ? <Button tone="secondary" label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space[4],
    gap: space[2],
  },
  button: {
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  state: { padding: space[8], alignItems: 'center', gap: space[4] },
});
