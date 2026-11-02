import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { formatEventWhen, isOngoing, priceLabel, useEvent, type EventDetail } from '@/api/events';
import { Button, Card, StateMessage, Text } from '@/components/ui';
import { directionsUrl, safeHttpsUrl } from '@/lib/links';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function EventScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useTranslation();
  const event = useEvent(slug);
  if (event.isLoading) return <StateMessage kind="loading" message={t('events.loading')} />;
  if (event.isError)
    return (
      <StateMessage
        kind="error"
        message={t('events.error')}
        action={{ label: t('explore.retry'), onPress: () => void event.refetch() }}
      />
    );
  if (!event.data) return <StateMessage kind="empty" message={t('events.notFound')} />;
  return <EventBody event={event.data} />;
}

function EventBody({ event }: { event: EventDetail }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const tickets = safeHttpsUrl(event.ticket_url);
  const website = safeHttpsUrl(event.website);
  const directions =
    event.latitude != null && event.longitude != null
      ? directionsUrl(Platform.OS, event.latitude, event.longitude, event.venue_name ?? event.title)
      : null;
  const when = formatEventWhen(event, i18n.language);
  const price = priceLabel(event, i18n.language, t('events.free'));
  const type = t(`eventType.${event.event_type}`, { defaultValue: event.event_type });

  return (
    <>
      <Stack.Screen options={{ title: event.title }} />
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
        <View style={{ gap: space[1] }}>
          <Text variant="eyebrow" muted>
            {[type, event.city].filter(Boolean).join(' · ')}
          </Text>
          <Text variant="headline" accessibilityRole="header">
            {event.title}
          </Text>
          <Text>{isOngoing(event) ? t('events.ongoing', { when }) : when}</Text>
          {event.venue ? (
            <Text
              accessibilityRole="link"
              style={{ textDecorationLine: 'underline' }}
              onPress={() => router.push({ pathname: '/venues/[slug]', params: { slug: event.venue!.slug } })}
            >
              {event.venue.name}
            </Text>
          ) : event.venue_name ? (
            <Text muted>{event.venue_name}</Text>
          ) : null}
          {event.address ? <Text muted>{event.address}</Text> : null}
          {price ? <Text>{price}</Text> : null}
          {event.age_restriction ? <Text muted>{t('events.age', { value: event.age_restriction })}</Text> : null}
        </View>

        <View style={styles.actions}>
          {tickets ? <Button label={t('events.tickets')} onPress={() => Linking.openURL(tickets)} /> : null}
          {directions ? (
            <Button tone="secondary" label={t('venue.directions')} onPress={() => Linking.openURL(directions)} />
          ) : null}
          {website ? (
            <Button tone="secondary" label={t('venue.website')} onPress={() => Linking.openURL(website)} />
          ) : null}
          <Button
            tone="secondary"
            label={t('venue.share')}
            onPress={() => Share.share({ message: `https://queer.guide/events/${event.slug}` })}
          />
        </View>

        {event.description ? (
          <Card>
            <Text variant="title">{t('venue.about')}</Text>
            <Text>{event.description}</Text>
          </Card>
        ) : null}

        {event.accessibility_attributes?.length ? (
          <Card>
            <Text variant="title">{t('venue.accessibility')}</Text>
            <Text>{event.accessibility_attributes.join(' · ')}</Text>
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space[4], gap: space[6], paddingBottom: space[12] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
