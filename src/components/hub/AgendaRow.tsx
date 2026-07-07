import { useTranslation } from 'react-i18next';
import { Plane, Ticket, Calendar as CalendarIcon, Star, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { AgendaItem, AgendaKind } from '@/hooks/useMyAgenda';

const KIND_ICON: Record<AgendaKind, LucideIcon> = {
  trip: Plane,
  reservation: Ticket,
  event_rsvp: CalendarIcon,
  event_saved: Star,
  group_event: Users,
};

const KIND_LABEL_KEY: Record<AgendaKind, string> = {
  trip: 'hub.calendar.kinds.trip',
  reservation: 'hub.calendar.kinds.reservation',
  event_rsvp: 'hub.calendar.kinds.going',
  event_saved: 'hub.calendar.kinds.saved',
  group_event: 'hub.calendar.kinds.groupEvent',
};

const KIND_LABEL_DEFAULT: Record<AgendaKind, string> = {
  trip: 'Trip',
  reservation: 'Booking',
  event_rsvp: 'Going',
  event_saved: 'Saved',
  group_event: 'Group event',
};

/**
 * A single agenda commitment row (trip / booking / RSVP / saved event), shared
 * by the Plans module's day-grouped agenda and the Overview module's "next up"
 * peek. Extracted from the former CalendarModule when Calendar folded into Plans.
 */
export function AgendaRow({ item }: { item: AgendaItem }) {
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
