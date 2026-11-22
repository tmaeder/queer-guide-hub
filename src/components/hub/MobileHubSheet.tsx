import { useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BottomNavSheet, NavSheetTile } from '@/components/layout/bottom-nav/BottomNavSheet';
import { getActiveHubModule, HUB_MODULES } from '@/config/hubModules';
import { Sparkles } from '@/components/icons';
import { StatusEditor } from '@/components/status/StatusEditor';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

interface MobileHubSheetProps {
  open: boolean;
  openedByPointer: boolean;
  onOpenChange: (open: boolean) => void;
  onDismissFocus: () => void;
}

/** No Today tile: the dock's Hub button already links to /hub. */
const TILES = HUB_MODULES.filter((m) => m.id !== 'overview');

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
  const vibe = profile as { vibe_emoji?: string | null; vibe_text?: string | null } | null;
  const vibeLabel = vibe?.vibe_text
    ? `${vibe.vibe_emoji ?? '✨'} ${vibe.vibe_text}`
    : t('chat.vibe.set', 'Set a vibe');

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
      hideTitle
    >
      {/* Your vibe, set right here instead of only from the Messages rail. */}
      {user && (
        <div className="rounded-container bg-muted p-2">
          {vibeOpen ? (
            <StatusEditor compact onDone={() => setVibeOpen(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setVibeOpen(true)}
              aria-expanded={false}
              className="flex min-h-11 w-full items-center gap-2 rounded-element px-2 text-left text-15 font-bold hover:bg-foreground/5"
            >
              <Sparkles size={18} aria-hidden className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{vibeLabel}</span>
            </button>
          )}
        </div>
      )}
      <nav aria-label={t('hub.nav', 'Hub sections')} className="flex min-w-0 flex-col gap-6">
        <div className="grid grid-cols-3 gap-1.5">
          {TILES.map((module) => (
            <NavSheetTile
              key={module.id}
              variant="tile"
              to={module.path}
              icon={module.icon}
              label={t(module.labelKey, module.defaultLabel)}
              active={module === activeModule}
              onClick={close}
            />
          ))}
        </div>
      </nav>
    </BottomNavSheet>
  );
}
