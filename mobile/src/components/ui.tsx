import { useEffect, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  type TextInputProps,
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
  busy,
  disabled,
  ...rest
}: PressableProps & { label: string; tone?: 'primary' | 'secondary' | 'destructive'; busy?: boolean }) {
  const { colors } = useTheme();
  const filled = tone !== 'secondary';
  const fill = tone === 'destructive' ? colors.destructive : colors.primary;
  const inactive = !!disabled || !!busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: !!busy }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: filled ? fill : 'transparent',
          borderColor: filled ? fill : colors.foreground,
          opacity: inactive ? 0.5 : pressed ? 0.7 : 1,
        },
      ]}
      {...rest}
    >
      {busy ? (
        <ActivityIndicator color={filled ? colors['primary-foreground'] : colors.foreground} />
      ) : (
        <Text
          variant="small"
          style={{ color: filled ? colors['primary-foreground'] : colors.foreground, fontWeight: '700' }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Labelled text input. The edge uses muted-foreground for 3:1 control contrast (WCAG 1.4.11). */
export function Field({
  label,
  error,
  style,
  ...rest
}: TextInputProps & { label: string; error?: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space[1] }}>
      <Text variant="small" style={{ fontWeight: '700' }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        allowFontScaling
        placeholderTextColor={colors['muted-foreground']}
        style={[
          styles.field,
          {
            color: colors.foreground,
            backgroundColor: colors.card,
            borderColor: error ? colors.destructive : colors['muted-foreground'],
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="small" style={{ color: colors.destructive }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Speak a message that appeared without focus moving to it. Android reads
 * accessibilityLiveRegion; iOS has no live regions, so VoiceOver users would
 * never hear an error that appears under the button they just pressed.
 */
export function useAnnounce(message: string | null | undefined) {
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
}

/** An error or status line that is announced when it appears. */
export function Alert({ message, tone = 'error' }: { message: string; tone?: 'error' | 'info' }) {
  const { colors } = useTheme();
  useAnnounce(message);
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={tone === 'error' ? { color: colors.destructive } : undefined}
    >
      {message}
    </Text>
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
  // Errors are announced; loading and empty states are not, to avoid chatter.
  useAnnounce(kind === 'error' ? message : null);
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
  field: { minHeight: 44, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space[4], fontSize: text.body },
  state: { padding: space[8], alignItems: 'center', gap: space[4] },
});
