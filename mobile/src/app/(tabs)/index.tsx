import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatEventWhen, isOngoing, MAX_MAP_EVENTS, useEventsInBounds, type EventListItem } from '@/api/events';
import { MAX_MAP_VENUES, useVenuesInBounds, type Bounds, type VenueListItem } from '@/api/venues';
import { Button, StateMessage, Text } from '@/components/ui';
import { QuickExitButton } from '@/features/discreet/QuickExitButton';
import { MAP_FONT_BOLD, mapStyle } from '@/map/style';
import { eventsToGeoJSON } from '@/map/eventsGeoJSON';
import { venuesToGeoJSON } from '@/map/venuesGeoJSON';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Zürich old town — a sensible first view until the user moves or asks for location. */
const INITIAL_CENTER: [number, number] = [8.5417, 47.3769];
const INITIAL_ZOOM = 13;
/** Below this zoom a viewport covers too much to fetch venues meaningfully. */
const MIN_FETCH_ZOOM = 9;

export default function ExploreScreen() {
  const { t, i18n } = useTranslation();
  const { colors, scheme } = useTheme();
  const camera = useRef<CameraRef>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const zoomRef = useRef(INITIAL_ZOOM);

  const style = useMemo(() => mapStyle(scheme, i18n.language), [scheme, i18n.language]);
  const [mode, setMode] = useState<'places' | 'events'>('places');
  const venues = useVenuesInBounds(mode === 'places' ? bounds : null);
  const events = useEventsInBounds(bounds, mode === 'events');
  const active = mode === 'places' ? venues : events;
  const placeList = venues.data ?? [];
  const eventList = events.data ?? [];
  const count = mode === 'places' ? placeList.length : eventList.length;
  const geojson = useMemo(
    () => (mode === 'places' ? venuesToGeoJSON(placeList) : eventsToGeoJSON(eventList)),
    [mode, placeList, eventList],
  );

  async function nearMe() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocationDenied(true);
      return;
    }
    setLocationDenied(false);
    // Used for the camera only; the position is never sent anywhere.
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    camera.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 14 });
  }

  const open = (slug: string) =>
    mode === 'places'
      ? router.push({ pathname: '/venues/[slug]', params: { slug } })
      : router.push({ pathname: '/events/[slug]', params: { slug } });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Map
        style={styles.map}
        mapStyle={style}
        logo={false}
        attribution
        compass
        // Pins are GL features VoiceOver/TalkBack cannot reach; the list
        // below carries the same places, so say so instead of a silent map.
        accessible
        accessibilityLabel={t('explore.mapLabel')}
        onRegionDidChange={(e) => {
          const { bounds: b, zoom } = e.nativeEvent;
          zoomRef.current = zoom;
          setBounds(zoom >= MIN_FETCH_ZOOM ? b : null);
        }}
      >
        <Camera ref={camera} initialViewState={{ center: INITIAL_CENTER, zoom: INITIAL_ZOOM }} />
        <GeoJSONSource
          id="venues"
          data={geojson}
          cluster
          clusterRadius={44}
          clusterMaxZoom={15}
          onPress={(e) => {
            const f = e.nativeEvent.features[0];
            const slug = f?.properties?.slug;
            if (typeof slug === 'string') {
              e.stopPropagation();
              open(slug);
            } else if (f?.geometry.type === 'Point') {
              camera.current?.easeTo({
                center: f.geometry.coordinates as [number, number],
                zoom: zoomRef.current + 2,
                duration: 300,
              });
            }
          }}
        >
          <Layer
            id="venue-clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': colors.foreground,
              'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24],
              'circle-stroke-color': colors.background,
              'circle-stroke-width': 2,
            }}
          />
          <Layer
            id="venue-cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': ['get', 'point_count_abbreviated'],
              'text-font': [MAP_FONT_BOLD],
              'text-size': 12,
            }}
            paint={{ 'text-color': colors.background }}
          />
          <Layer
            id="venue-points"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-color': colors['track-pink'],
              'circle-radius': 7,
              'circle-stroke-color': colors.foreground,
              'circle-stroke-width': 1.5,
            }}
          />
        </GeoJSONSource>
      </Map>

      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <QuickExitButton />
        <View style={styles.topActions}>
          <Button tone="secondary" label={t('search.title')} onPress={() => router.push('/search')} />
          <Button tone="primary" label={t('explore.nearMe')} onPress={nearMe} />
        </View>
      </SafeAreaView>

      <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.modes} accessibilityRole="tablist">
          {(['places', 'events'] as const).map((m) => (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              onPress={() => setMode(m)}
              style={[styles.mode, { borderBottomColor: mode === m ? colors.foreground : 'transparent' }]}
            >
              <Text style={{ fontWeight: mode === m ? '700' : '400' }}>{t(`explore.mode.${m}`)}</Text>
            </Pressable>
          ))}
        </View>
        <ListHeader
          mode={mode}
          count={count}
          loading={active.isFetching}
          zoomedOut={bounds == null}
          locationDenied={locationDenied}
        />
        {active.isError ? (
          <StateMessage
            kind="error"
            message={t('explore.error')}
            action={{ label: t('explore.retry'), onPress: () => void active.refetch() }}
          />
        ) : bounds != null && !active.isFetching && count === 0 ? (
          <StateMessage kind="empty" message={mode === 'places' ? t('explore.empty') : t('events.empty')} />
        ) : mode === 'places' ? (
          <FlatList
            data={placeList}
            keyExtractor={(v) => v.id}
            renderItem={({ item }) => <VenueRow venue={item} onPress={() => open(item.slug)} />}
            contentContainerStyle={{ paddingBottom: space[12] }}
          />
        ) : (
          <FlatList
            data={eventList}
            keyExtractor={(e) => e.id}
            renderItem={({ item }) => <EventRow event={item} onPress={() => open(item.slug)} />}
            contentContainerStyle={{ paddingBottom: space[12] }}
          />
        )}
      </View>
    </View>
  );
}

function ListHeader({
  mode,
  count,
  loading,
  zoomedOut,
  locationDenied,
}: {
  mode: 'places' | 'events';
  count: number;
  loading: boolean;
  zoomedOut: boolean;
  locationDenied: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.listHeader}>
      <Text variant="eyebrow" muted>
        {zoomedOut
          ? t('explore.zoomIn')
          : loading
            ? t('explore.loading')
            : count >= (mode === 'places' ? MAX_MAP_VENUES : MAX_MAP_EVENTS)
              ? t('explore.capped', { count })
              : mode === 'places'
                ? t('explore.count', { count })
                : t('events.count', { count })}
      </Text>
      {locationDenied ? (
        <Text variant="small" muted>
          {t('explore.locationDenied')}
        </Text>
      ) : null}
    </View>
  );
}

function VenueRow({ venue, onPress }: { venue: VenueListItem; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={({ pressed }) => [
        styles.row,
        { borderColor: colors.border, backgroundColor: pressed ? colors.muted : 'transparent' },
      ]}
    >
      <Text variant="body" style={{ fontWeight: '700' }} numberOfLines={1}>
        {venue.name}
      </Text>
      <Text variant="small" muted numberOfLines={1}>
        {[t(`category.${venue.category}`, { defaultValue: venue.category }), venue.city]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Pressable>
  );
}

function EventRow({ event, onPress }: { event: EventListItem; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const when = formatEventWhen(event, i18n.language);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={({ pressed }) => [
        styles.row,
        { borderColor: colors.border, backgroundColor: pressed ? colors.muted : 'transparent' },
      ]}
    >
      <Text variant="body" style={{ fontWeight: '700' }} numberOfLines={1}>
        {event.title}
      </Text>
      <Text variant="small" muted numberOfLines={1}>
        {[isOngoing(event) ? t('events.ongoingShort') : when, event.venue_name ?? event.city]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  modes: { flexDirection: 'row', gap: space[4], paddingHorizontal: space[4] },
  mode: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2 },
  map: { flex: 3 },
  topActions: { flexDirection: 'row', gap: space[2] },
  topBar: {
    position: 'absolute',
    top: 0,
    left: space[4],
    right: space[4],
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheet: {
    flex: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: -16,
  },
  listHeader: { paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[2], gap: space[1] },
  row: {
    paddingHorizontal: space[4],
    paddingVertical: space[2] + space[1],
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    justifyContent: 'center',
  },
});
