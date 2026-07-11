import { Plane, Ticket, Calendar as CalendarIcon, Star, Users, Cake, Newspaper, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { CalendarItem, CalendarKind } from './types';

const CHIP_ICON: Record<CalendarKind, LucideIcon> = {
  trip: Plane,
  reservation: Ticket,
  event_rsvp: CalendarIcon,
  event_saved: Star,
  group_event: Users,
  birthday: Cake,
  history: Sparkles,
  news: Newspaper,
};

/**
 * Monochrome chip differentiation by fill/border/weight only (never hue):
 * committed items (RSVP, booking) render filled, ambient items (saved,
 * history, news) render outlined, trips/birthdays get the muted fill.
 */
const CHIP_STYLE: Record<CalendarKind, string> = {
  trip: 'bg-muted text-foreground border-transparent',
  reservation: 'bg-foreground text-background border-transparent',
  event_rsvp: 'bg-foreground text-background border-transparent',
  event_saved: 'bg-background text-foreground border-border',
  group_event: 'bg-muted text-foreground border-transparent',
  birthday: 'bg-muted text-foreground border-transparent',
  history: 'bg-background text-muted-foreground border-border',
  news: 'bg-background text-muted-foreground border-border',
};

export function EventChip({ item }: { item: CalendarItem }) {
  const Icon = CHIP_ICON[item.kind];
  return (
    <LocalizedLink
      to={item.open_target}
      className={cn(
        'flex min-w-0 items-center gap-1 rounded-badge border px-1.5 py-0.5 text-2xs no-underline',
        CHIP_STYLE[item.kind],
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate font-medium">{item.title}</span>
    </LocalizedLink>
  );
}
