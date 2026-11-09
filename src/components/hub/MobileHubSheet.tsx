import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { NavBadge } from '@/components/layout/bottom-nav/NavBadge';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { getActiveHubModule, HUB_MODULES, HUB_SECTIONS } from '@/config/hubModules';
import { cn } from '@/lib/utils';

interface MobileHubSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unreadCount: number;
  onDismissFocus: () => void;
}

export function MobileHubSheet({
  open,
  onOpenChange,
  unreadCount,
  onDismissFocus,
}: MobileHubSheetProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const activeModule = getActiveHubModule(pathname);
  const title = t('header.mobileNav.hub', 'Hub');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="inset-x-0 bottom-0 top-auto mx-auto max-h-[85dvh] grid-cols-1 translate-x-0 translate-y-0 overflow-y-auto rounded-b-none pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=open]:animate-none data-[state=closed]:animate-none"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onDismissFocus();
        }}
      >
        <DialogTitle className="font-display text-headline">{title}</DialogTitle>
        <nav aria-label={t('hub.nav', 'Hub sections')} className="min-w-0 columns-2 gap-4">
          {HUB_SECTIONS.map((section) => (
            <div key={section.id} className="mb-4 break-inside-avoid">
              {section.defaultLabel && (
                <p className="px-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
                  {section.labelKey
                    ? t(section.labelKey, section.defaultLabel)
                    : section.defaultLabel}
                </p>
              )}
              <ul>
                {HUB_MODULES.filter((module) => module.section === section.id).map((module) => {
                  const Icon = module.icon;
                  const active = module === activeModule;
                  return (
                    <li key={module.id}>
                      <DialogClose asChild>
                        <LocalizedLink
                          to={module.path}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex min-h-11 items-center gap-2 rounded-element px-2 py-1 text-sm no-underline',
                            active
                              ? 'bg-foreground font-semibold text-background'
                              : 'hover:bg-muted',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="min-w-0 break-words">
                            {t(module.labelKey, module.defaultLabel)}
                          </span>
                          {module.badge === 'unread' && (
                            <NavBadge
                              inline
                              count={unreadCount}
                              label={t('header.mobileNav.unreadCount', '{{count}} unread', {
                                count: unreadCount,
                              })}
                            />
                          )}
                        </LocalizedLink>
                      </DialogClose>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
