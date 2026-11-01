import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useVenue, type VenueDetail } from '@/api/venues';
import { Button, Card, StateMessage, Text } from '@/components/ui';
import { savedStore } from '@/features/saved/savedStore';
import { safeHttpsUrl, directionsUrl, telUrl } from '@/lib/links';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function VenueScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useTranslation();
  const venue = useVenue(slug);

  if (venue.isLoading) return <StateMessage kind="loading" message={t('explore.loading')} />;
  if (venue.isError)
    return (
      <StateMessage
        kind="error"
        message={t('explore.error')}
        action={{ label: t('explore.retry'), onPress: () => void venue.refetch() }}
      />
    );
  if (!venue.data) return <StateMessage kind="empty" message={t('venue.notFound')} />;
  return <VenueBody venue={venue.data} />;
}

function VenueBody({ venue }: { venue: VenueDetail }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const saved = useSyncExternalStore(
    savedStore.subscribe,
    () => savedStore.has(venue.slug),
    () => savedStore.has(venue.slug),
  );
  const image = venue.images?.find((u) => safeHttpsUrl(u));
  const website = safeHttpsUrl(venue.website);
  const phone = telUrl(venue.phone);
  const directions =
    venue.latitude != null && venue.longitude != null
      ? directionsUrl(Platform.OS, venue.latitude, venue.longitude, venue.name)
      : null;
  const category = t(`category.${venue.category}`, { defaultValue: venue.category });

  async function toggleSave() {
    await savedStore.toggle({
      slug: venue.slug,
      name: venue.name,
      category: venue.category,
      city: venue.city,
    });
    void Haptics.selectionAsync();
  }

  return (
    <>
      <Stack.Screen options={{ title: venue.name }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        {image ? (
          <Image
            source={image}
            style={styles.hero}
            contentFit="cover"
            accessibilityIgnoresInvertColors
            transition={150}
          />
        ) : null}

        <View style={{ gap: space[1] }}>
          <Text variant="eyebrow" muted>
            {[category, venue.city].filter(Boolean).join(' · ')}
          </Text>
          <Text variant="headline" accessibilityRole="header">
            {venue.name}
          </Text>
          {venue.address ? <Text muted>{venue.address}</Text> : null}
        </View>

        <View style={styles.actions}>
          <Button
            label={saved ? t('venue.saved') : t('venue.save')}
            tone={saved ? 'secondary' : 'primary'}
            accessibilityState={{ selected: saved }}
            onPress={toggleSave}
          />
          {directions ? (
            <Button tone="secondary" label={t('venue.directions')} onPress={() => Linking.openURL(directions)} />
          ) : null}
          {phone ? <Button tone="secondary" label={t('venue.call')} onPress={() => Linking.openURL(phone)} /> : null}
          {website ? (
            <Button tone="secondary" label={t('venue.website')} onPress={() => Linking.openURL(website)} />
          ) : null}
          <Button
            tone="secondary"
            label={t('venue.share')}
            onPress={() => Share.share({ message: `https://queer.guide/venues/${venue.slug}` })}
          />
        </View>

        {venue.description ? (
          <Card>
            <Text variant="title">{t('venue.about')}</Text>
            <Text>{venue.description}</Text>
          </Card>
        ) : null}

        {venue.accessibility_attributes?.length ? (
          <Card>
            <Text variant="title">{t('venue.accessibility')}</Text>
            <Text>{venue.accessibility_attributes.join(' · ')}</Text>
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space[4], gap: space[6], paddingBottom: space[12] },
  hero: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
