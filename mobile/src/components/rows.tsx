import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';
import { formatEventWhen, isOngoing, type EventListItem } from '@/api/events';
import type { VenueListItem } from '@/api/venues';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** One-line list rows for places and events, shared by Explore and city screens. */
export function VenueRow({ venue, onPress }: { venue: VenueListItem; onPress: () => void }) {
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

export function EventRow({ event, onPress }: { event: EventListItem; onPress: () => void }) {
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
  row: {
    paddingHorizontal: space[4],
    paddingVertical: space[2] + space[1],
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    justifyContent: 'center',
  },
});
