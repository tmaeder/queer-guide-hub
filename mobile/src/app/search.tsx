import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { MIN_QUERY, useVenueSearch, type VenueHit } from '@/api/search';
import { StateMessage, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, text } from '@/theme/tokens';

export default function SearchScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [input, setInput] = useState('');
  const search = useVenueSearch(input);
  const tooShort = input.trim().length < MIN_QUERY;
  const hits = search.data?.hits ?? [];

  const open = (slug: string) => router.push({ pathname: '/venues/[slug]', params: { slug } });

  let body: React.ReactNode = null;
  if (tooShort) body = <StateMessage kind="empty" message={t('search.hint')} />;
  else if (search.isError) body = <StateMessage kind="error" message={t('search.offline')} />;
  else if (search.isPending) body = <StateMessage kind="loading" message={t('search.loading')} />;
  else if (hits.length === 0) body = <StateMessage kind="empty" message={t('search.empty')} />;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: t('search.title') }} />
      <TextInput
        value={input}
        onChangeText={setInput}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
        placeholder={t('search.placeholder')}
        placeholderTextColor={colors['muted-foreground']}
        accessibilityLabel={t('search.placeholder')}
        allowFontScaling
        // Field edge uses muted-foreground: a form control needs 3:1 (WCAG 1.4.11),
        // which the 12%-ink divider colour does not reach.
        style={[
          styles.input,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: colors['muted-foreground'] },
        ]}
      />
      {search.data?.offline && !tooShort ? (
        <Text variant="small" muted accessibilityLiveRegion="polite">
          {t('search.fromPacks')}
        </Text>
      ) : null}
      {body ?? (
        <FlatList
          data={hits}
          keyExtractor={(h) => h.slug}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => <Row hit={item} onPress={() => open(item.slug)} />}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
        />
      )}
    </View>
  );
}

function Row({ hit, onPress }: { hit: VenueHit; onPress: () => void }) {
  const { t } = useTranslation();
  const category = hit.category ? t(`category.${hit.category}`, { defaultValue: hit.category }) : null;
  const meta = [category, hit.city].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[hit.name, meta].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.name}>{hit.name}</Text>
      {meta ? (
        <Text variant="small" muted>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: space[4], gap: space[2] },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    fontSize: text.body,
  },
  row: { paddingVertical: space[2], minHeight: 44, justifyContent: 'center', gap: space[1] },
  name: { fontWeight: '700' },
  sep: { height: StyleSheet.hairlineWidth },
});
