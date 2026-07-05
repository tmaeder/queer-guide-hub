import { Inbox, Bookmark, Luggage, Calendar, type LucideIcon } from 'lucide-react';

/**
 * Registry for the /hub personal office modules. Single source of truth for
 * the shell's side nav (desktop) and module scroller (mobile) — shipping a new
 * module = adding one entry here plus its route in routes.tsx and its case in
 * HubPage. Paths must be static (no params) so the optional /:locale? parent
 * can't mis-capture a segment (see the /me and /community comments in
 * routes.tsx).
 */

export type HubModuleId = 'inbox' | 'calendar' | 'contacts' | 'saved' | 'news' | 'trips';

export interface HubModule {
  id: HubModuleId;
  /** Locale-less absolute path (LocalizedLink adds the prefix). */
  path: string;
  icon: LucideIcon;
  labelKey: string;
  defaultLabel: string;
  /** Show the unified inbox unread badge on this module's nav entry. */
  badge?: 'unread';
}

export const HUB_MODULES: HubModule[] = [
  {
    id: 'inbox',
    path: '/hub',
    icon: Inbox,
    labelKey: 'hub.modules.inbox',
    defaultLabel: 'Inbox',
    badge: 'unread',
  },
  {
    id: 'calendar',
    path: '/hub/calendar',
    icon: Calendar,
    labelKey: 'hub.modules.calendar',
    defaultLabel: 'Calendar',
  },
  {
    id: 'trips',
    path: '/hub/trips',
    icon: Luggage,
    labelKey: 'hub.modules.trips',
    defaultLabel: 'Trips',
  },
  {
    id: 'saved',
    path: '/hub/saved',
    icon: Bookmark,
    labelKey: 'hub.modules.saved',
    defaultLabel: 'Saved',
  },
];
