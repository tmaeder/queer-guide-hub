import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { CITY_VENUE_LIMIT, useCity, useCityContent, type CityDetail } from '@/api/cities';
import { EventRow, VenueRow } from '@/components/rows';
import { Button, Card, StateMessage, Text } from '@/components/ui';
import { useSession } from '@/features/auth/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Events shown before "and N more" — a city page is an overview, not the feed. */
const EVENT_PREVIEW = 8;

export default function CityScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useTranslation();
  const city = useCity(slug);
  if (city.isLoading) return <StateMessage kind="loading" message={t('city.loading')} />;
  if (city.isError)
    return (
      <StateMessage
        kind="error"
        message={t('city.error')}
        action={{ label: t('explore.retry'), onPress: () => void city.refetch() }}
      />
    );
  if (!city.data) return <StateMessage kind="empty" message={t('city.notFound')} />;
  return <CityBody city={city.data} />;
}

function CityBody({ city }: { city: CityDetail }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const session = useSession();
  const signedIn = !!session;
  const { venues, events, gated } = useCityContent(city.id, signedIn);
  const eventList = events.data ?? [];
  const venueList = venues.data ?? [];
  const gatedCount = !signedIn ? (gated.data?.count ?? 0) : 0;

  return (
    <>
      <Stack.Screen options={{ title: city.name }} />
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
        <View style={styles.pad}>
          {city.country ? (
            <Text variant="eyebrow" muted>
              {city.country.name}
            </Text>
          ) : null}
          <Text variant="headline" accessibilityRole="header">
            {city.name}
          </Text>
          {city.description ? <Text>{city.description}</Text> : null}
        </View>

        {gatedCount > 0 ? (
          <View style={styles.pad}>
            <Card>
              <Text>{t('city.gated', { count: gatedCount })}</Text>
              {gated.data?.highRisk ? <Text muted>{t('city.highRisk')}</Text> : null}
              <Button label={t('account.signInOrUp')} onPress={() => router.push('/auth')} />
            </Card>
          </View>
        ) : null}

        <Section title={t('city.events')} query={events} empty={t('city.noEvents')}>
          {eventList.slice(0, EVENT_PREVIEW).map((e) => (
            <EventRow
              key={e.id}
              event={e}
              onPress={() => router.push({ pathname: '/events/[slug]', params: { slug: e.slug } })}
            />
          ))}
          {eventList.length > EVENT_PREVIEW ? (
            <Text variant="small" muted style={styles.pad}>
              {t('city.moreEvents', { count: eventList.length - EVENT_PREVIEW })}
            </Text>
          ) : null}
        </Section>

        <Section title={t('city.places')} query={venues} empty={t('city.noPlaces')}>
          {venueList.map((v) => (
            <VenueRow
              key={v.id}
              venue={v}
              onPress={() => router.push({ pathname: '/venues/[slug]', params: { slug: v.slug } })}
            />
          ))}
          {venueList.length >= CITY_VENUE_LIMIT ? (
            <Text variant="small" muted style={styles.pad}>
              {t('city.capped', { count: CITY_VENUE_LIMIT })}
            </Text>
          ) : null}
        </Section>
      </ScrollView>
    </>
  );
}

function Section({
  title,
  query,
  empty,
  children,
}: {
  title: string;
  query: { isLoading: boolean; isError: boolean; data?: unknown[] };
  empty: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  let body: React.ReactNode = children;
  if (query.isLoading) body = <StateMessage kind="loading" message={t('explore.loading')} />;
  else if (query.isError) body = <StateMessage kind="error" message={t('city.sectionError')} />;
  else if (!query.data?.length) body = <Text muted style={styles.pad}>{empty}</Text>;
  return (
    <View style={{ gap: space[1] }}>
      <Text variant="title" accessibilityRole="header" style={styles.pad}>
        {title}
      </Text>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: space[4], gap: space[6] },
  pad: { paddingHorizontal: space[4], gap: space[2] },
});
