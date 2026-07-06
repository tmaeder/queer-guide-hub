import {
  LayoutDashboard,
  MessageCircle,
  CalendarClock,
  Bookmark,
  type LucideIcon,
} from 'lucide-react';

/**
 * Registry for the /hub personal office modules. Single source of truth for
 * the shell's side nav (desktop) and module scroller (mobile) — shipping a new
 * module = adding one entry here plus its route in routes.tsx and its case in
 * HubPage. Paths must be static (no params) so the optional /:locale? parent
 * can't mis-capture a segment (see the /me and /community comments in
 * routes.tsx).
 *
 * Consolidated 2026-07 from six modules to four: Overview (new landing),
 * Messages (former Inbox + Contacts), Plans (former Calendar + Trips) and
 * Saved (favorites + former News's saved searches). The News discovery feed
 * moved to the public /news "For You" section; the retired module paths
 * redirect in routes.tsx.
 */

export type HubModuleId = 'overview' | 'messages' | 'plans' | 'saved';

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
    id: 'overview',
    path: '/hub',
    icon: LayoutDashboard,
    labelKey: 'hub.modules.overview',
    defaultLabel: 'Overview',
  },
  {
    id: 'messages',
    path: '/hub/messages',
    icon: MessageCircle,
    labelKey: 'hub.modules.messages',
    defaultLabel: 'Messages',
    badge: 'unread',
  },
  {
    id: 'plans',
    path: '/hub/plans',
    icon: CalendarClock,
    labelKey: 'hub.modules.plans',
    defaultLabel: 'Plans',
  },
  {
    id: 'saved',
    path: '/hub/saved',
    icon: Bookmark,
    labelKey: 'hub.modules.saved',
    defaultLabel: 'Saved',
  },
];
