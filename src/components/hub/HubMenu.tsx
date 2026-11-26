import { useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { NavSheetTile } from '@/components/layout/bottom-nav/BottomNavSheet';
import { getActiveHubModule, HUB_MODULES } from '@/config/hubModules';
import { ChevronRight, Sparkles } from '@/components/icons';
import { StatusEditor } from '@/components/status/StatusEditor';
import { GoLiveSwitch } from '@/components/people/GoLiveSwitch';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { useInboxRealtime, useInboxUnreadCounts } from '@/hooks/useInboxFeed';
import { NavBadge } from '@/components/layout/bottom-nav/NavBadge';
import { InboxPanel } from '@/components/notifications/InboxPanel';

/** Three tiles per row; a short last row stretches to fill (no holes). */
function tileSpan(i: number, n: number) {
  const rem = n % 3;
  if (rem === 0 || i < n - rem) return 'col-span-2';
  return rem === 2 ? 'col-span-3' : 'col-span-6';
}

/**
 * The Hub menu: inbox, your status, and the Hub sections. One body for the
 * phone sheet (dock → Hub) and the desktop header popover. `includeToday`
 * adds the Today tile where the trigger itself does not lead to /hub.
 */
export function HubMenuBody({
  onNavigate,
  includeToday = false,
}: {
  onNavigate: () => void;
  includeToday?: boolean;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const activeModule = getActiveHubModule(pathname);
  const { user } = useAuth();
  const { profile } = useProfile();
  const [vibeOpen, setVibeOpen] = useState(false);
  const tripCount = useInboxBadge();
  const tiles = includeToday ? HUB_MODULES : HUB_MODULES.filter((m) => m.id !== 'overview');
  const vibe = profile as { vibe_emoji?: string | null; vibe_text?: string | null } | null;
  const vibeLabel = vibe?.vibe_text
    ? `${vibe.vibe_emoji ?? '✨'} ${vibe.vibe_text}`
    : t('hub.vibeHint', 'How you feel and what you’re here for');

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Inbox first: messages and alerts are the time-sensitive part of the
            Hub. Shared by the phone sheet and the desktop header popover. */}
      {user && (
        <section
          aria-label={t('header.inbox.label', 'Inbox')}
          className="overflow-hidden rounded-container bg-muted"
        >
          <InboxPanel onNavigate={onNavigate} />
        </section>
      )}
      {/* Status: your vibe and whether you're visible nearby. Same row anatomy
            for both — icon disc, label, one-line state, trailing control. */}
      {user && (
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-container bg-muted">
          {vibeOpen ? (
            <div className="p-4">
              <StatusEditor onDone={() => setVibeOpen(false)} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setVibeOpen(true)}
              aria-expanded={false}
              className="flex min-h-14 w-full items-center gap-4 px-4 py-2 text-left hover:bg-foreground/5"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card">
                <Sparkles size={18} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-15 font-bold">{t('chat.vibe.title', 'Your vibe')}</span>
                <span className="block truncate text-xs text-muted-foreground">{vibeLabel}</span>
              </span>
              <ChevronRight size={18} aria-hidden className="shrink-0 text-muted-foreground" />
            </button>
          )}
          <GoLiveSwitch />
        </div>
      )}
      <nav aria-label={t('hub.nav', 'Hub sections')} className="flex min-w-0 flex-col gap-6">
        <div className="grid grid-cols-6 gap-1.5">
          {tiles.map((module, i) => (
            <div key={module.id} className={tileSpan(i, tiles.length)}>
              <NavSheetTile
                key={module.id}
                variant="tile"
                to={module.path}
                icon={module.icon}
                label={t(module.labelKey, module.defaultLabel)}
                active={module === activeModule}
                onClick={onNavigate}
                badge={
                  module.id === 'plans' && tripCount > 0 ? (
                    <NavBadge
                      inline
                      count={tripCount}
                      label={t(
                        'header.mobileNav.tripsBadge',
                        '{{count}} trip items need attention',
                        {
                          count: tripCount,
                        },
                      )}
                    />
                  ) : undefined
                }
              />
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}

export interface HeaderHubProps {
  /** `true` on the compact header's ink plate — `ghost` would render ink on ink. */
  onInk?: boolean;
}

/**
 * The desktop header's Hub entry: the same menu as the dock's Hub sheet, in a
 * popover (not a dropdown menu — Radix menus swallow Tab and typeahead, which
 * breaks the vibe editor). Badge = everything unread in the inbox. Also mounts
 * the user's inbox realtime channel.
 */
export function HeaderHub({ onInk = false }: HeaderHubProps = {}) {
  const { t } = useTranslation();
  useInboxRealtime();
  const total = useInboxUnreadCounts().all;
  const [open, setOpen] = useState(false);
  const label =
    total > 0
      ? t('header.hub.unread', 'Hub, {{count}} unread', { count: total })
      : t('header.mobileNav.hub', 'Hub');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={onInk ? 'ghostReversed' : 'ghost'}
          size="icon"
          className="relative"
          aria-label={label}
          title={t('header.mobileNav.hub', 'Hub')}
        >
          <TransitIcon name="chat" size={24} />
          {total > 0 && (
            <span
              aria-hidden="true"
              // Magenta on the flagship track with `--track-ring` type (the
              // fill does not flip with the mode, so its type must not
              // either). `-end-1` so RTL pins it to the right corner.
              className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-badge bg-track-pink px-1 text-2xs font-bold leading-none text-track-ring"
            >
              {total > 99 ? '99+' : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={t('header.mobileNav.hub', 'Hub')}
        className="max-h-[calc(100dvh-5rem)] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto bg-card p-4 backdrop-blur-none"
      >
        <HubMenuBody includeToday onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
