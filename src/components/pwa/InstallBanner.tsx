import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Download } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { isAdminRoute, isMapRoute, stripLocale } from '@/lib/locale';
import { usePWA } from './PWAProvider';
import { isIOSSafari } from './isIOSSafari';

const DISMISS_KEY = 'pwa-install-dismissed';
const DISMISS_DAYS = 30;
/** Distinct pages seen this session before we ask. A first-page prompt is noise. */
const PAGES_BEFORE_PROMPT = 3;

/**
 * Routes where an install prompt is the wrong thing to show: crisis and safety
 * pages (no interruptions for someone in distress), and auth/onboarding flows
 * (the reader is mid-task and the card would sit on top of the form).
 */
const SUPPRESSED = /^\/(help|safety|auth|login|onboarding)(\/|$)|^\/report-/;

function isDismissed(): boolean {
  try {
    const expiry = Number(localStorage.getItem(DISMISS_KEY));
    if (!expiry) return false;
    if (Date.now() > expiry) {
      localStorage.removeItem(DISMISS_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function rememberDismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 864e5));
  } catch {
    // localStorage unavailable — the card still closes for this session
  }
}

export function InstallBanner() {
  const { t } = useTranslation();
  const { canInstall, isInstalled, promptInstall } = usePWA();
  const { showBanner: consentOpen } = useCookieConsent();
  const { pathname } = useLocation();
  const path = stripLocale(pathname);
  const suppressed = SUPPRESSED.test(path) || isMapRoute(pathname) || isAdminRoute(pathname);

  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [closed, setClosed] = useState(isDismissed);
  const [ios] = useState(() => typeof navigator !== 'undefined' && isIOSSafari());

  useEffect(() => {
    if (suppressed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- counts route changes, an external event.
    setSeen((s) => (s.has(path) ? s : new Set(s).add(path)));
  }, [path, suppressed]);

  const visible =
    !closed &&
    !isInstalled &&
    !consentOpen &&
    !suppressed &&
    seen.size >= PAGES_BEFORE_PROMPT &&
    (canInstall || ios);

  const close = () => {
    rememberDismiss();
    setClosed(true);
  };

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      rememberDismiss();
      setClosed(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  const handleInstall = async () => {
    // Accepted or declined in the native dialog, the browser has answered;
    // asking again next page would be nagging.
    await promptInstall();
    close();
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label={t('pwa.install.ariaLabel')}
      className="animate-in fade-in-0 slide-in-from-bottom-4 duration-normal motion-reduce:animate-none fixed inset-x-[var(--island-inset)] bottom-[calc(var(--island-inset)+env(safe-area-inset-bottom,0px)+5.5rem+var(--audio-bar-clearance,0rem))] z-[var(--z-sticky)] rounded-container bg-card p-4 shadow-soft-lg md:bottom-[calc(var(--island-inset)+var(--audio-bar-clearance,0rem))] md:left-auto md:w-sm"
    >
      <div className="flex items-start gap-4">
        <img
          src="/icons/icon-96.png"
          alt=""
          width={48}
          height={48}
          className="size-12 shrink-0 rounded-element shadow-soft"
        />
        <div className="min-w-0 flex-1">
          <p className="text-15 font-bold leading-snug">
            {ios ? t('pwa.install.iosTitle') : t('pwa.install.title')}
          </p>
          <p className="mt-1 text-13 leading-relaxed text-muted-foreground">
            {ios ? t('pwa.install.iosHint') : t('pwa.install.description')}
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={close}>
          {ios ? t('pwa.install.gotIt') : t('pwa.install.notNow')}
        </Button>
        {!ios && (
          <Button size="sm" onClick={handleInstall} className="font-bold">
            <Download size={16} className="me-2" aria-hidden />
            {t('pwa.install.action')}
          </Button>
        )}
      </div>
    </div>
  );
}
