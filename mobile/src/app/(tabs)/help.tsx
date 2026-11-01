import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { channelHref, channelsOf, hotlinesFor, useHotlines, type Hotline } from '@/api/hotlines';
import { Button, Card, StateMessage, Text } from '@/components/ui';
import { QuickExitButton } from '@/features/discreet/QuickExitButton';
import { deviceRegion } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/**
 * Support lines for the device's region, then international ones.
 * The region comes from the device locale — no location permission needed.
 */
export default function HelpScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const region = deviceRegion();
  const hotlines = useHotlines();
  const lines = useMemo(() => hotlinesFor(hotlines.data ?? [], region), [hotlines.data, region]);

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text variant="display" accessibilityRole="header">
          {t('help.title')}
        </Text>
        <QuickExitButton />
      </View>
      <Text>{t('help.intro')}</Text>
      <Text variant="small" muted>
        {region ? t('help.region', { region }) : t('help.regionUnknown')}
      </Text>
      <Text variant="small" style={{ fontWeight: '700' }}>
        {t('help.emergency')}
      </Text>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={lines}
        keyExtractor={(h) => h.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          hotlines.isLoading ? (
            <StateMessage kind="loading" message={t('help.loading')} />
          ) : hotlines.isError ? (
            <StateMessage
              kind="error"
              message={t('help.error')}
              action={{ label: t('explore.retry'), onPress: () => void hotlines.refetch() }}
            />
          ) : (
            <StateMessage kind="empty" message={t('help.empty')} />
          )
        }
        renderItem={({ item }) => <HotlineCard line={item} />}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

function HotlineCard({ line }: { line: Hotline }) {
  const { t } = useTranslation();
  const badges = [
    line.always_open ? t('help.alwaysOpen') : line.hours,
    line.free ? t('help.free') : null,
    line.anonymous ? t('help.anonymous') : null,
  ].filter(Boolean);

  return (
    <Card>
      <Text variant="title">{line.name}</Text>
      {badges.length ? (
        <Text variant="small" muted>
          {badges.join(' · ')}
        </Text>
      ) : null}
      {line.description ? <Text>{line.description}</Text> : null}
      {/* Three-state on purpose: absent renders nothing (see Hotline.reports_to_police). */}
      {line.reports_to_police === true ? (
        <Text variant="small" style={{ fontWeight: '700' }}>
          {t('help.mayContactPolice')}
        </Text>
      ) : line.reports_to_police === false ? (
        <Text variant="small" muted>
          {t('help.noContactPolice')}
        </Text>
      ) : null}
      <View style={styles.channels}>
        {channelsOf(line).map((c, i) => {
          const href = channelHref(c);
          if (!href) return null;
          return (
            <Button
              key={`${c.kind}-${i}`}
              tone={i === 0 ? 'primary' : 'secondary'}
              label={c.label ?? `${t(`help.channel.${c.kind}`)} ${c.kind === 'phone' || c.kind === 'sms' ? c.value : ''}`.trim()}
              onPress={() => Linking.openURL(href)}
            />
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { gap: space[2], paddingBottom: space[4] },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  list: { padding: space[4], gap: space[4], paddingBottom: space[12] },
  channels: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[2] },
});
