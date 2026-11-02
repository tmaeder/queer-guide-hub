import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme/ThemeProvider';

/** Native tab bar (UITabBar / Material bottom navigation). Max 5 tabs on Android. */
export default function TabLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <NativeTabs tintColor={colors.foreground}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t('tabs.explore')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="map" md="map" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saved">
        <NativeTabs.Trigger.Label>{t('tabs.saved')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bookmark" md="bookmark" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="help">
        <NativeTabs.Trigger.Label>{t('tabs.help')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="phone" md="call" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="me">
        <NativeTabs.Trigger.Label>{t('tabs.me')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
