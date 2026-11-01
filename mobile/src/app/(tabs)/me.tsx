import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Text } from '@/components/ui';
import { DiscreetSettingsSection } from '@/features/discreet/DiscreetSettingsSection';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function MeScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="display" accessibilityRole="header">
          {t('me.title')}
        </Text>
        <Card>
          <Text variant="title">{t('me.privacy')}</Text>
          <Text>{t('me.privacyBody')}</Text>
        </Card>
        <DiscreetSettingsSection />
        <Button tone="secondary" label={t('me.website')} onPress={() => Linking.openURL('https://queer.guide')} />
        <Text variant="small" muted>
          {t('me.version', { version: Constants.expoConfig?.version ?? '—' })}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: space[4], gap: space[6] },
});
