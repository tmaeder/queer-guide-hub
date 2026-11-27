import { useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { NavSheetTile } from '@/components/layout/bottom-nav/BottomNavSheet';
import { getActiveHubModule, HUB_MODULES } from '@/config/hubModules';
import { ArrowRight, ChevronRight, Sparkles } from '@/components/icons';
import { StatusEditor } from '@/components/status/StatusEditor';
import { GoLiveSwitch } from '@/components/people/GoLiveSwitch';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useInboxRealtime, useInboxUnreadCounts } from '@/hooks/useInboxFeed';
import { HubPanel } from './HubPanel';

/** Three tiles per row; a short last row stretches to fill (no holes). */
function tileSpan(i: number, n: number) {
  const rem = n % 3;
  if (rem === 0 || i < n - rem) return 'col-span-2';
  return rem === 2 ? 'col-span-3' : 'col-span-6';
}

/**
 * Signed-out visitors get plain section links: the previews need an account,
 * and each section page shows its own sign-in gate.
 */
function HubSectionLinks({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const activeModule = getActiveHubModule(useLocation().pathname);
  return (
    <nav aria-label={t('hub.nav', 'Hub sections')} className="grid min-w-0 grid-cols-6 gap-1.5">
      {HUB_MODULES.map((module, i) => (
        <div key={module.id} className={tileSpan(i, HUB_MODULES.length)}>
          <NavSheetTile
            variant="tile"
            to={module.path}
            icon={module.icon}
            label={t(module.labelKey, module.defaultLabel)}
            active={module === activeModule}
            onClick={onNavigate}
          />
        </div>
      ))}
    </nav>
  );
}

/**
 * The Hub menu: tabs for your inbox and every Hub section (each showing its own
 * items), then your status. One body for the phone sheet (dock → Hub) and the
 * desktop header popover.
 */
export function HubMenuBody({
  onNavigate,
  besideClose = false,
}: {
  onNavigate: () => void;
  /** Phone sheet: no visible title, so the status row leads, beside the close button. */
  besideClose?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile } = useProfile();
  const [vibeOpen, setVibeOpen] = useState(false);
  // A Contribute form is open: give it the room, hide the status row.
  const [focused, setFocused] = useState(false);
  const vibe = profile as { vibe_emoji?: string | null; vibe_text?: string | null } | null;
  const vibeLabel = vibe?.vibe_text
    ? `${vibe.vibe_emoji ?? '✨'} ${vibe.vibe_text}`
    : t('chat.vibe.title', 'Your vibe');

  // Status: your vibe and whether you're visible nearby, side by side on one
  // compact row; the vibe editor opens full width below it. On the phone sheet
  // it leads, sharing the close button's row (DOM order = visual order).
  const status = user && !focused && (
    <div className={cn('flex flex-col gap-1.5', besideClose && '-mt-12 me-12')}>
      <div className={cn('flex items-start', besideClose ? 'gap-1' : 'gap-1.5')}>
        <button
          type="button"
          onClick={() => setVibeOpen((open) => !open)}
          aria-expanded={vibeOpen}
          title={t('hub.vibeHint', 'How you feel and what you’re here for')}
          className={cn(
            'flex min-h-11 min-w-0 max-w-1/2 flex-none items-center gap-2 rounded-element bg-muted text-left hover:bg-surface-container-high',
            besideClose ? 'px-2' : 'px-2.5',
          )}
        >
          <Sparkles size={16} aria-hidden className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-13 font-bold">{vibeLabel}</span>
          {!besideClose && (
            <ChevronRight
              size={16}
              aria-hidden
              className={cn(
                'shrink-0 text-muted-foreground transition-transform',
                vibeOpen && 'rotate-90',
              )}
            />
          )}
        </button>
        <GoLiveSwitch />
      </div>
      {vibeOpen && (
        <div className="rounded-container bg-muted p-4">
          <StatusEditor onDone={() => setVibeOpen(false)} />
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {besideClose && status}
      {/* Your inbox and every Hub section as tabs, each with its own items. */}
      {user ? (
        <section
          aria-label={t('header.mobileNav.hub', 'Hub')}
          className="overflow-hidden rounded-container bg-muted"
        >
          <HubPanel onNavigate={onNavigate} onFocusChange={setFocused} />
        </section>
      ) : (
        <HubSectionLinks onNavigate={onNavigate} />
      )}
      {!besideClose && status}
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
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant={onInk ? 'ghostReversed' : 'ghost'}
          size="icon"
          // Button shrinks every svg to 16px; keep the header icon at its
          // drawn size so it matches the search icon beside it.
          className="relative [&_svg]:size-7"
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
        sideOffset={8}
        className="max-h-[calc(100dvh-5rem)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto bg-card p-4 backdrop-blur-none"
      >
        {/* The phone sheet has its own title; the popover gets a slim one, plus
            the way to Today (/hub), which is not a tab. */}
        <div className="flex items-center justify-between gap-4 px-1 pb-4">
          <span className="text-15 font-bold">{t('header.mobileNav.hub', 'Hub')}</span>
          <LocalizedLink
            to="/hub"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-9 items-center gap-1 rounded-badge px-2 text-xs font-bold no-underline transition-colors hover:bg-surface-container-high"
          >
            {t('hub.calendar.today', 'Today')}
            <ArrowRight size={14} aria-hidden />
          </LocalizedLink>
        </div>
        <HubMenuBody onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
