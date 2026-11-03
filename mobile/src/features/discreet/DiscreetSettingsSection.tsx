import { resetAppIcon, setAlternateAppIcon, supportsAlternateIcons } from 'expo-alternate-app-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { useDiscreet } from './DiscreetGate';
import { canEnableLock } from './lockPolicy';
import {
  ALTERNATE_ICONS,
  discreetSettings,
  LOCK_AFTER_OPTIONS_MS,
  useDiscreetSettings,
  type AppIcon,
} from './settings';

export function DiscreetSettingsSection() {
  const { t } = useTranslation();
  const settings = useDiscreetSettings();
  const { authenticate } = useDiscreet();
  const [lockAvailable, setLockAvailable] = useState<boolean | null>(null);
  const [iconError, setIconError] = useState(false);

  useEffect(() => {
    void Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ])
      .then(([hasHardware, enrolled, securityLevel]) =>
        setLockAvailable(canEnableLock({ hasHardware, enrolled, securityLevel })),
      )
      .catch(() => setLockAvailable(false));
  }, []);

  async function toggleLock(next: boolean) {
    // Prove the user can unlock BEFORE turning the lock on (or off), so a
    // misconfigured device cannot lock itself out, and someone else holding
    // the phone cannot quietly disable it.
    if (!(await authenticate())) return;
    await discreetSettings.update({ lockEnabled: next });
  }

  async function chooseIcon(icon: AppIcon) {
    setIconError(false);
    try {
      if (icon === 'default') await resetAppIcon();
      else await setAlternateAppIcon(icon);
      await discreetSettings.update({ icon });
    } catch {
      setIconError(true);
    }
  }

  return (
    <Card>
      <Text variant="title">{t('discreet.title')}</Text>
      <Text variant="small" muted>
        {t('discreet.intro')}
      </Text>

      <Row
        label={t('discreet.lock')}
        hint={lockAvailable === false ? t('discreet.lockUnavailable') : t('discreet.lockHint')}
        value={settings.lockEnabled}
        disabled={!lockAvailable}
        onChange={toggleLock}
      />
      {settings.lockEnabled ? (
        <Choice
          label={t('discreet.lockAfter')}
          options={LOCK_AFTER_OPTIONS_MS.map((ms) => ({
            value: ms,
            label: ms === 0 ? t('discreet.lockImmediately') : t('discreet.lockMinutes', { count: ms / 60_000 }),
          }))}
          value={settings.lockAfterMs}
          onChange={(lockAfterMs) => void discreetSettings.update({ lockAfterMs })}
        />
      ) : null}

      <Row
        label={t('discreet.hideInSwitcher')}
        hint={Platform.OS === 'android' ? t('discreet.hideInSwitcherAndroid') : t('discreet.hideInSwitcherIos')}
        value={settings.hideInSwitcher}
        onChange={(hideInSwitcher) => void discreetSettings.update({ hideInSwitcher })}
      />

      <Row
        label={t('discreet.quickExit')}
        hint={t('discreet.quickExitHint')}
        value={settings.quickExit}
        onChange={(quickExit) => void discreetSettings.update({ quickExit })}
      />

      {supportsAlternateIcons ? (
        <>
          <Choice
            label={t('discreet.icon')}
            options={(['default', ...ALTERNATE_ICONS] as AppIcon[]).map((icon) => ({
              value: icon,
              label: t(`discreet.iconName.${icon}`),
            }))}
            value={settings.icon}
            onChange={chooseIcon}
          />
          <Text variant="small" muted>
            {Platform.OS === 'ios' ? t('discreet.iconHintIos') : t('discreet.iconHintAndroid')}
          </Text>
          {iconError ? (
            <Text variant="small" style={{ fontWeight: '700' }}>
              {t('discreet.iconError')}
            </Text>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function Row({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={{ fontWeight: '700' }}>{label}</Text>
        {hint ? (
          <Text variant="small" muted>
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: colors.foreground, false: colors.muted }}
        thumbColor={colors.background}
      />
    </View>
  );
}

function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={{ fontWeight: '700' }}>{label}</Text>
      <View style={styles.choices}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(o.value)}
              style={[
                styles.chip,
                {
                  borderColor: colors.foreground,
                  backgroundColor: selected ? colors.foreground : 'transparent',
                },
              ]}
            >
              <Text variant="small" style={{ color: selected ? colors.background : colors.foreground }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingVertical: space[2] },
  rowText: { flex: 1, gap: space[1] },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: space[4],
    minHeight: 44,
    justifyContent: 'center',
  },
});
