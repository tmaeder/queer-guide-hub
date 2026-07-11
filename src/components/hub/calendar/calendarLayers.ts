import { Plane, CalendarDays, Cake, Sparkles, Newspaper, type LucideIcon } from 'lucide-react';
import type { CalendarLayerId } from './types';

export interface CalendarLayer {
  id: CalendarLayerId;
  icon: LucideIcon;
  labelKey: string;
  defaultLabel: string;
  /** Enabled when the user has no stored preference. */
  defaultOn: boolean;
}

/**
 * Layer registry for the /hub/plans unified calendar. `news` defaults OFF —
 * saved articles only carry a publish date, a weak calendar fit. `birthdays`
 * defaults ON but is self-limiting (only friends who opted in via
 * birthday_visibility appear).
 */
export const CALENDAR_LAYERS: CalendarLayer[] = [
  {
    id: 'trips',
    icon: Plane,
    labelKey: 'hub.calendar.layers.trips',
    defaultLabel: 'Trips & bookings',
    defaultOn: true,
  },
  {
    id: 'events',
    icon: CalendarDays,
    labelKey: 'hub.calendar.layers.events',
    defaultLabel: 'Events',
    defaultOn: true,
  },
  {
    id: 'birthdays',
    icon: Cake,
    labelKey: 'hub.calendar.layers.birthdays',
    defaultLabel: 'Friends’ birthdays',
    defaultOn: true,
  },
  {
    id: 'history',
    icon: Sparkles,
    labelKey: 'hub.calendar.layers.history',
    defaultLabel: 'Queer history',
    defaultOn: true,
  },
  {
    id: 'news',
    icon: Newspaper,
    labelKey: 'hub.calendar.layers.news',
    defaultLabel: 'Saved news',
    defaultOn: false,
  },
];
