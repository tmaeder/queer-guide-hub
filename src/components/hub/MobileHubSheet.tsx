import { useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BottomNavSheet, NavSheetTile } from '@/components/layout/bottom-nav/BottomNavSheet';
import { getActiveHubModule, HUB_MODULES } from '@/config/hubModules';
import { ChevronRight, Sparkles } from '@/components/icons';
import { StatusEditor } from '@/components/status/StatusEditor';
import { GoLiveSwitch } from '@/components/people/GoLiveSwitch';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { NavBadge } from '@/components/layout/bottom-nav/NavBadge';
import { InboxPanel } from '@/components/notifications/HeaderInbox';

interface MobileHubSheetProps {
  open: boolean;
  openedByPointer: boolean;
  onOpenChange: (open: boolean) => void;
  onDismissFocus: () => void;
}

/** No Today tile: the dock's Hub button already links to /hub. */
const TILES = HUB_MODULES.filter((m) => m.id !== 'overview');

/** Three tiles per row; a short last row stretches to fill (no holes). */
function tileSpan(i: number, n: number) {
  const rem = n % 3;
  if (rem === 0 || i < n - rem) return 'col-span-2';
  return rem === 2 ? 'col-span-3' : 'col-span-6';
}

export function MobileHubSheet({
  open,
  openedByPointer,
  onOpenChange,
  onDismissFocus,
}: MobileHubSheetProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const activeModule = getActiveHubModule(pathname);
  const close = () => onOpenChange(false);
  const { user } = useAuth();
  const { profile } = useProfile();
  const [vibeOpen, setVibeOpen] = useState(false);
  const tripCount = useInboxBadge();
  const vibe = profile as { vibe_emoji?: string | null; vibe_text?: string | null } | null;
  const vibeLabel = vibe?.vibe_text
    ? `${vibe.vibe_emoji ?? '✨'} ${vibe.vibe_text}`
    : t('hub.vibeHint', 'How you feel and what you’re here for');

  return (
    <BottomNavSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('header.mobileNav.hub', 'Hub')}
      description={t(
        'header.mobileNav.hubDescription',
        'Your messages, plans, people and saved things.',
      )}
      openedByPointer={openedByPointer}
      onDismissFocus={onDismissFocus}
    >
      {/* Inbox first: messages and alerts are the time-sensitive part of the
          Hub. Same panel as the desktop header Inbox. */}
      {user && (
        <section
          aria-label={t('header.inbox.label', 'Inbox')}
          className="overflow-hidden rounded-container bg-muted"
        >
          <InboxPanel onNavigate={close} />
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
          {TILES.map((module, i) => (
            <div key={module.id} className={tileSpan(i, TILES.length)}>
              <NavSheetTile
                key={module.id}
                variant="tile"
                to={module.path}
                icon={module.icon}
                label={t(module.labelKey, module.defaultLabel)}
                active={module === activeModule}
                onClick={close}
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
    </BottomNavSheet>
  );
}
