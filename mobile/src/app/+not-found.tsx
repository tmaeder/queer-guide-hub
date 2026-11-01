import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { space } from '@/theme/tokens';

/** A queer.guide link the app has no screen for yet lands here. */
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <View style={styles.root}>
      <Text>{t('venue.notFound')}</Text>
      <Link href="/">
        <Text style={{ fontWeight: '700' }}>{t('tabs.explore')}</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[4], padding: space[8] },
});
