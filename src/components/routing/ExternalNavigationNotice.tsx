import { externalDestination } from '@/lib/externalDestination';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { isAdminRoute } from '@/lib/locale';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

export function ExternalNavigationNotice() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [destination, setDestination] = useState<{ url: URL; target: string } | null>(null);
  useEffect(() => {
    if (isAdminRoute(pathname)) return;
    const intercept = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.hasAttribute('download') ||
        anchor.closest('[data-quick-exit]') ||
        anchor.dataset.externalNotice === 'skip'
      )
        return;
      const url = externalDestination(anchor.href, window.location.origin);
      if (!url) return;
      event.preventDefault();
      event.stopPropagation();
      setDestination({ url, target: event.metaKey || event.ctrlKey ? '_blank' : anchor.target });
    };
    document.addEventListener('click', intercept, true);
    return () => document.removeEventListener('click', intercept, true);
  }, [pathname]);
  return (
    <AlertDialog
      open={!!destination}
      onOpenChange={(open) => {
        if (!open) setDestination(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('navigation.external.title', 'Open another website?')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'navigation.external.description',
              'You are leaving queer.guide. The destination has its own content and privacy policy.',
            )}
            <span className="mt-2 block break-all font-medium text-foreground">
              {destination?.url.hostname}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('navigation.external.cancel', 'Stay here')}</AlertDialogCancel>
          <AlertDialogAction asChild>
            <a
              href={destination?.url.href}
              target={destination?.target || '_self'}
              rel="noopener noreferrer"
              data-external-notice="skip"
            >
              {t('navigation.external.continue', 'Open website')}
            </a>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
