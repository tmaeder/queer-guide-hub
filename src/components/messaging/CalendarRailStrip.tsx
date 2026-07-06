import { useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { TripRailCard } from '@/components/messaging/TripRailCard';
import { useUpcomingCalendar, type CalendarEventItem } from '@/hooks/useCalendarItems';

function EventRailCard({ event }: { event: CalendarEventItem }) {
  const navigate = useNavigate();
  const date = new Date(event.start_date);
  return (
    <button
      type="button"
      onClick={() => navigate(event.path)}
      className="w-full text-left border-b px-4 py-2 hover:bg-muted/50 transition-colors flex items-center gap-2"
    >
      <div
        className="rounded-element bg-muted flex flex-col items-center justify-center shrink-0"
        style={{ width: 44, height: 44 }}
      >
        <span className="text-2xs uppercase tracking-wider text-muted-foreground leading-none">
          {date.toLocaleDateString(undefined, { month: 'short' })}
        </span>
        <span className="text-sm font-semibold leading-tight">{date.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm truncate">{event.title}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {[event.venue_name, event.city].filter(Boolean).join(' · ') || ' '}
        </p>
      </div>
    </button>
  );
}

/** Compact "Upcoming" strip in the inbox rail: next trips + saved events. */
export function CalendarRailStrip() {
  const { t } = useTranslation();
  const { data: items = [] } = useUpcomingCalendar(14, 4);
  // Day-granular "now", computed once per items change (render must stay pure).
  const todayMs = useMemo(() => new Date(new Date().toDateString()).getTime(), []);

  if (items.length === 0) return null;

  return (
    <div className="border-b">
      <div className="flex items-center justify-between px-4 pt-2 pb-1">
        <span className="text-2xs uppercase tracking-wider text-muted-foreground">
          {t('inbox.upcoming', { defaultValue: 'Upcoming' })}
        </span>
        <Link
          to="/hub/plans"
          className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <CalendarDays size={12} />
          {t('inbox.openCalendar', { defaultValue: 'Calendar' })}
        </Link>
      </div>
      {items.map((item) =>
        item.kind === 'trip' ? (
          <TripRailCard
            key={`trip-${item.id}`}
            trip={{
              id: item.id,
              title: item.title,
              start_date: item.start_date,
              end_date: item.end_date,
              primary_city_name: item.city,
              primary_country_code: item.country_code,
              cover_image_url: item.image_url,
              daysUntilStart: Math.max(
                0,
                Math.floor(
                  (new Date(`${item.start_date}T00:00:00`).getTime() - todayMs) /
                    (24 * 60 * 60 * 1000),
                ),
              ),
            }}
          />
        ) : (
          <EventRailCard key={`event-${item.id}`} event={item} />
        ),
      )}
    </div>
  );
}
