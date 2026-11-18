import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { NavBadge } from '@/components/layout/bottom-nav/NavBadge';
import {
  BottomNavSheet,
  NAV_SHEET_HEADING,
  NavSheetTile,
} from '@/components/layout/bottom-nav/BottomNavSheet';
import { getActiveHubModule, HUB_MODULES, HUB_SECTIONS } from '@/config/hubModules';

interface MobileHubSheetProps {
  open: boolean;
  openedByPointer: boolean;
  onOpenChange: (open: boolean) => void;
  unreadCount: number;
  onDismissFocus: () => void;
}

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
      <nav aria-label={t('hub.nav', 'Hub sections')} className="flex min-w-0 flex-col gap-6">
        {HUB_SECTIONS.map((section) => {
          const modules = HUB_MODULES.filter((module) => module.section === section.id);
          if (!modules.length) return null;
          return (
            <div key={section.id} className="flex flex-col gap-2">
              {section.defaultLabel && (
                <h3 className={NAV_SHEET_HEADING}>
                  {section.labelKey
                    ? t(section.labelKey, section.defaultLabel)
                    : section.defaultLabel}
                </h3>
              )}
              <div className="grid grid-cols-3 gap-2">
                {modules.map((module) => (
                  <NavSheetTile
                    key={module.id}
                    to={module.path}
                    icon={module.icon}
                    label={t(module.labelKey, module.defaultLabel)}
                    active={module === activeModule}
                    onClick={() => onOpenChange(false)}
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
            </div>
          );
        })}
      </nav>
    </BottomNavSheet>
  );
}
