import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StateMessage, Text } from '@/components/ui';
import { useSession } from '@/features/auth/useSession';
import { useSaved } from '@/features/saved/savedStore';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function SavedScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const saved = useSaved();
  const session = useSession();

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.background }]}>
      <Text variant="display" accessibilityRole="header" style={styles.title}>
        {t('saved.title')}
      </Text>
      {session ? (
        <Text variant="small" muted style={{ paddingHorizontal: space[4] }}>
          {t('saved.synced')}
        </Text>
      ) : null}
      <FlatList
        data={saved}
        keyExtractor={(p) => p.slug}
        ListEmptyComponent={<StateMessage kind="empty" message={t('saved.empty')} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/venues/[slug]', params: { slug: item.slug } })}
            style={({ pressed }) => [
              styles.row,
              { borderColor: colors.border, backgroundColor: pressed ? colors.muted : 'transparent' },
            ]}
          >
            <Text style={{ fontWeight: '700' }}>{item.name}</Text>
            <Text variant="small" muted>
              {[t(`category.${item.category}`, { defaultValue: item.category }), item.city]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { paddingHorizontal: space[4], paddingVertical: space[4] },
  row: {
    paddingHorizontal: space[4],
    paddingVertical: space[2] + space[1],
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
});
