import { useTranslation } from 'react-i18next';
import { useFeaturedEvents } from '@/hooks/useFeaturedEvents';
import { EventCard } from '@/components/events/EventCard';
import { EventRail, EventRailItem } from '@/components/events/EventRail';

interface FeaturedEventsRailProps {
  city?: string | null;
  limit?: number;
}

export function FeaturedEventsRail({ city, limit = 8 }: FeaturedEventsRailProps) {
  const { t } = useTranslation();
  const { events, loading } = useFeaturedEvents({ city, limit });

  if (loading) {
    return (
      <EventRail
        title={t('pages.events.rail.featured', 'Featured this week')}
        subtitle={t('pages.events.rail.featuredSubtitle', 'Editor picks')}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <EventRailItem key={i}>
            <EventCard loading />
          </EventRailItem>
        ))}
      </EventRail>
    );
  }

  if (events.length === 0) return null;

  return (
    <EventRail
      title={t('pages.events.rail.featured', 'Featured this week')}
      subtitle={t('pages.events.rail.featuredSubtitle', 'Editor picks')}
    >
      {events.map((event) => (
        <EventRailItem key={event.id}>
          <EventCard event={event} />
        </EventRailItem>
      ))}
    </EventRail>
  );
}
