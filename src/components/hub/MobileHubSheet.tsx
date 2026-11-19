import { useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { NavBadge } from '@/components/layout/bottom-nav/NavBadge';
import {
  BottomNavSheet,
  NAV_SHEET_HEADING,
  NavSheetTile,
} from '@/components/layout/bottom-nav/BottomNavSheet';
import { getActiveHubModule, HUB_MODULES, HUB_SECTIONS } from '@/config/hubModules';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Sparkles } from '@/components/icons';
import { StatusEditor } from '@/components/status/StatusEditor';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

interface MobileHubSheetProps {
  open: boolean;
  openedByPointer: boolean;
  onOpenChange: (open: boolean) => void;
  unreadCount: number;
  onDismissFocus: () => void;
}

/** Personal first; `home` (Overview) moves to the header as "Open Hub". */
const ORDER = ['personal', 'community', 'connect'] as const;

export function MobileHubSheet({
  open,
  openedByPointer,
  onOpenChange,
  unreadCount,
  onDismissFocus,
}: MobileHubSheetProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const activeModule = getActiveHubModule(pathname);
  const overview = HUB_MODULES.find((m) => m.section === 'home');
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
      headerAction={
        overview && (
          <LocalizedLink
            to={overview.path}
            onClick={close}
            aria-current={overview === activeModule ? 'page' : undefined}
            className="shrink-0 text-13 font-bold underline underline-offset-4"
          >
            {t('header.mobileNav.openHub', 'Open Hub')}
          </LocalizedLink>
        )
      }
    >
      {/* Your vibe, set right here instead of only from the Messages rail. */}
      {user && (
        <div className="overflow-hidden rounded-element bg-muted">
          <button
            type="button"
            onClick={() => setVibeOpen((o) => !o)}
            aria-expanded={vibeOpen}
            className="flex min-h-12 w-full items-center gap-2 px-4 py-2 text-left text-15 font-bold hover:bg-foreground/5"
          >
            <Sparkles size={18} aria-hidden className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{vibeLabel}</span>
          </button>
          {vibeOpen && (
            <div className="border-t border-border-hairline p-4">
              <StatusEditor onDone={() => setVibeOpen(false)} />
            </div>
          )}
        </div>
      )}
      <nav aria-label={t('hub.nav', 'Hub sections')} className="flex min-w-0 flex-col gap-6">
        {/* Your own things first: the three a returning member opens most,
            as big tiles. Then the community lists as two-column rows, so
            long labels ("Travel buddies") read in full instead of truncating. */}
        {ORDER.map((sectionId) => {
          const section = HUB_SECTIONS.find((s) => s.id === sectionId);
          const modules = HUB_MODULES.filter((m) => m.section === sectionId);
          if (!section || !modules.length) return null;
          const personal = sectionId === 'personal';
          return (
            <section key={sectionId} className="flex flex-col gap-2">
              {!personal && section.defaultLabel && (
                <h3 className={NAV_SHEET_HEADING}>
                  {section.labelKey
                    ? t(section.labelKey, section.defaultLabel)
                    : section.defaultLabel}
                </h3>
              )}
              <div className={personal ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'}>
                {modules.map((module) => (
                  <NavSheetTile
                    key={module.id}
                    variant={personal ? 'tile' : 'row'}
                    to={module.path}
                    icon={module.icon}
                    label={t(module.labelKey, module.defaultLabel)}
                    active={module === activeModule}
                    onClick={close}
                    badge={
                      module.badge === 'unread' && unreadCount > 0 ? (
                        <NavBadge
                          inline
                          count={unreadCount}
                          label={t('header.mobileNav.unreadCount', '{{count}} unread', {
                            count: unreadCount,
                          })}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}
      </nav>
    </BottomNavSheet>
  );
}
