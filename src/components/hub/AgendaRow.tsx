import { useTranslation } from 'react-i18next';
import {
  Plane,
  Ticket,
  Calendar as CalendarIcon,
  Star,
  Users,
  Cake,
  Sparkles,
  Newspaper,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { AgendaItem } from '@/hooks/useMyAgenda';
import type { CalendarItem, CalendarKind } from '@/components/hub/calendar/types';

const KIND_ICON: Record<CalendarKind, LucideIcon> = {
  trip: Plane,
  reservation: Ticket,
  event_rsvp: CalendarIcon,
  event_saved: Star,
  group_event: Users,
  birthday: Cake,
  history: Sparkles,
  news: Newspaper,
};

const KIND_LABEL_KEY: Record<CalendarKind, string> = {
  trip: 'hub.calendar.kinds.trip',
  reservation: 'hub.calendar.kinds.reservation',
  event_rsvp: 'hub.calendar.kinds.going',
  event_saved: 'hub.calendar.kinds.saved',
  group_event: 'hub.calendar.kinds.groupEvent',
  birthday: 'hub.calendar.kinds.birthday',
  history: 'hub.calendar.kinds.history',
  news: 'hub.calendar.kinds.news',
};

const KIND_LABEL_DEFAULT: Record<CalendarKind, string> = {
  trip: 'Trip',
  reservation: 'Booking',
  event_rsvp: 'Going',
  event_saved: 'Saved',
  group_event: 'Group event',
  birthday: 'Birthday',
  history: 'Queer history',
  news: 'Saved news',
};

/**
 * A single calendar/agenda row, shared by the unified calendar's day/week
 * views and the Overview module's "next up" peek. Accepts the calendar
 * superset (AgendaItem rows pass through unchanged — CalendarItem only adds
 * kinds + a layer tag).
 */
export function AgendaRow({ item }: { item: AgendaItem | CalendarItem }) {
  const { t } = useTranslation();
  const Icon = KIND_ICON[item.kind];
  const time = item.all_day
    ? t('hub.calendar.allDay', { defaultValue: 'All day' })
    : new Date(item.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <LocalizedLink
      to={item.open_target}
      className="flex items-center gap-2 rounded-element border border-border px-4 py-2 no-underline transition-colors hover:bg-muted"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        {item.subtitle && (
          <p className="truncate text-13 text-muted-foreground">{item.subtitle}</p>
        )}
      </div>
      <span className="shrink-0 text-13 text-muted-foreground">
        {t(KIND_LABEL_KEY[item.kind], { defaultValue: KIND_LABEL_DEFAULT[item.kind] })} · {time}
      </span>
    </LocalizedLink>
  );
}
