import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Download, Plus, Smartphone, Upload, X, Zap } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
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
const SUPPRESSED = /^\/(help|safety|auth|login|onboarding|app)(\/|$)|^\/report-/;

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

  const rows = ios
    ? [
        { icon: Upload, text: t('pwa.install.iosStep1') },
        { icon: Plus, text: t('pwa.install.iosStep2') },
      ]
    : [
        { icon: Zap, text: t('pwa.install.benefitTap') },
        { icon: Smartphone, text: t('pwa.install.benefitFull') },
      ];
  // ol on iOS: the two steps happen in order; ul for the benefits.
  const List = ios ? 'ol' : 'ul';

  return (
    <div
      role="region"
      aria-label={t('pwa.install.ariaLabel')}
      className="animate-in fade-in-0 slide-in-from-bottom-4 duration-normal motion-reduce:animate-none fixed inset-x-[var(--island-inset)] bottom-[calc(var(--island-inset)+env(safe-area-inset-bottom,0px)+5.5rem+var(--audio-bar-clearance,0rem))] z-[var(--z-sticky)] rounded-container bg-card p-4 shadow-soft-lg md:bottom-[calc(var(--island-inset)+var(--audio-bar-clearance,0rem))] md:left-auto md:w-sm"
    >
      <div className="flex items-center gap-4">
        <img
          src="/icons/icon-96.png"
          alt=""
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-element border border-border-hairline"
        />
        <p className="min-w-0 flex-1 text-title font-bold leading-tight">
          {t('pwa.install.headline')}
        </p>
        <Button
          variant="ghost"
          size="icon"
          onClick={close}
          aria-label={t('pwa.install.notNow')}
          className="-me-2 shrink-0"
        >
          <X size={18} aria-hidden />
        </Button>
      </div>

      <List className="mt-4 space-y-2">
        {rows.map(({ icon: Icon, text }, n) => (
          <li key={text} className="flex items-center gap-4 text-13">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
              {ios ? (
                <span className="text-xs2 font-bold" aria-hidden>
                  {n + 1}
                </span>
              ) : (
                <Icon size={16} aria-hidden />
              )}
            </span>
            <span className="min-w-0 flex-1">{text}</span>
            {ios && <Icon size={18} aria-hidden className="shrink-0" />}
          </li>
        ))}
      </List>

      <div className="mt-4 flex gap-2">
        <Button asChild variant="outline" className="flex-1">
          <LocalizedLink to="/app" className="no-underline">
            {t('pwa.install.learnMore')}
          </LocalizedLink>
        </Button>
        {!ios && (
          <Button onClick={handleInstall} className="flex-1 font-bold">
            <Download size={16} className="me-2" aria-hidden />
            {t('pwa.install.action')}
          </Button>
        )}
      </div>
    </div>
  );
}
