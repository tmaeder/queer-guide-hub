import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { CurrencySelector } from '@/components/i18n/CurrencySelector';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { cn } from '@/lib/utils';
import { INTENT_NAV, INTENT_TRACK, isIntentActive } from '@/config/navigation';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { OPEN_COOKIE_PREFERENCES_EVENT } from '@/lib/analyticsConsent';
import { Wordmark } from '@/components/brand/Wordmark';
import { useSiteBranding } from '@/hooks/useSiteBranding';
import { PAGE_GUTTER } from '@/components/layout/PageContainer';
import './Footer.css';

const legalLinks = [
  { href: '/privacy', labelKey: 'footer.privacy', fallback: 'Privacy' },
  { href: '/terms', labelKey: 'footer.terms', fallback: 'Terms' },
  { href: '/legal', labelKey: 'footer.legalLink', fallback: 'Legal' },
  { href: '/accessibility', labelKey: 'header.legal.accessibility', fallback: 'Accessibility' },
  { href: '/about', labelKey: 'footer.about', fallback: 'About' },
  { href: '/contact', labelKey: 'footer.contact', fallback: 'Contact' },
  { href: '/email-updates', labelKey: 'footer.emailUpdates', fallback: 'Email updates' },
  { href: '/donate', labelKey: 'footer.supportUs', fallback: 'Support Us' },
];

// Keep the canonical feedback route for general safety concerns.
const REPORT_HREF = '/submit/feedback?category=safety';
const footerLink =
  'inline-flex min-h-11 min-w-11 items-center text-13 md:min-w-0 no-underline underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current';

export interface FooterProps {
  variant?: 'full' | 'compact';
}

export function Footer({ variant = 'full' }: FooterProps = {}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const currentYear = new Date().getFullYear();
  const branding = useSiteBranding();
  const siteName = branding.siteName ?? 'Queer Guide';
  const localePath = pathname.replace(/^\/(?:[a-z]{2}\/)?/, '/');

  if (variant === 'compact') {
    return (
      <footer className="mt-auto py-4 md:py-8">
        <div className={cn('island-capped rounded-panel bg-card py-4', PAGE_GUTTER)}>
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-0 md:gap-y-2">
            <LocalizedLink to="/" className={footerLink} aria-label={siteName}>
              <Wordmark className="text-title text-foreground" />
            </LocalizedLink>
            <nav
              aria-label={t('footer.essentials', 'Footer essentials')}
              className="flex flex-wrap items-center gap-x-6 text-foreground"
            >
              <LocalizedLink to={REPORT_HREF} className={footerLink}>
                {t('footer.report', 'Report')}
              </LocalizedLink>
              <LocalizedLink to="/help" className={footerLink}>
                {t('footer.hotlines', 'Hotlines')}
              </LocalizedLink>
              <LocalizedLink to="/privacy" className={footerLink}>
                {t('footer.privacy', 'Privacy')}
              </LocalizedLink>
              <LocalizedLink to="/terms" className={footerLink}>
                {t('footer.terms', 'Terms')}
              </LocalizedLink>
            </nav>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="mt-auto py-4 md:py-8">
      {/* Share the header's outer geometry, not just its content max-width. */}
      <div
        className={cn(
          'island-capped relative overflow-hidden rounded-panel bg-foreground py-4 text-background md:py-6',
          PAGE_GUTTER,
        )}
      >
        <div className="flex flex-col gap-x-10 gap-y-0 md:gap-y-4 lg:flex-row lg:items-center lg:justify-between">
          <LocalizedLink to="/" className={cn(footerLink, 'self-start')} aria-label={siteName}>
            <Wordmark className="text-title text-background" />
          </LocalizedLink>
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap items-center gap-x-4 md:gap-x-6"
          >
            {INTENT_NAV.map((intent) => (
              <LocalizedLink
                key={intent.to}
                to={intent.to}
                data-track={INTENT_TRACK[intent.id] ?? 'pink'}
                aria-current={isIntentActive(intent, localePath) ? 'page' : undefined}
                className={cn(
                  footerLink,
                  'footer-route-link font-medium text-background/80 hover:text-background hover:no-underline aria-[current=page]:text-background aria-[current=page]:font-bold',
                )}
              >
                <span>{t(intent.labelKey, intent.fallback)}</span>
                <span className="footer-route-marker" aria-hidden="true" />
              </LocalizedLink>
            ))}
          </nav>
        </div>

        <div className="mt-2 flex flex-col gap-x-8 gap-y-0 border-t border-background/20 py-2 md:mt-4 md:flex-row md:gap-y-2 md:py-4 md:items-center md:justify-between">
          <p className="text-13 leading-relaxed text-background/80">
            {t('footer.antiDiscrimination.title', "We don't do bigotry here.")}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 md:gap-x-6">
            <LocalizedLink to={REPORT_HREF} className={footerLink}>
              {t('footer.reportSomething', 'Report something')}
            </LocalizedLink>
            <LocalizedLink to="/help" className={footerLink}>
              {t('footer.emergency.title', 'Crisis lines, 24 hours')}
            </LocalizedLink>
          </div>
        </div>

        <div className="border-t border-background/20 pt-2 md:pt-4">
          <div className="flex flex-col gap-x-8 gap-y-0 md:gap-y-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 md:gap-x-6">
              {legalLinks.map((link) => (
                <LocalizedLink
                  key={link.href}
                  to={link.href}
                  aria-current={localePath === link.href ? 'page' : undefined}
                  className={cn(footerLink, 'text-background/70 hover:text-background')}
                >
                  {t(link.labelKey, link.fallback)}
                </LocalizedLink>
              ))}
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent(OPEN_COOKIE_PREFERENCES_EVENT))}
                className={cn(footerLink, 'text-start text-background/70 hover:text-background')}
              >
                {t('footer.cookiePreferences', 'Cookie preferences')}
              </button>
            </div>
            {/* Triggers inherit the ink surface; portaled menus keep their own theme. */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:text-background [&_button:hover]:underline">
              <LanguageSwitcher />
              <CurrencySelector />
              <ThemeToggle />
            </div>
          </div>
          <p className="mt-2 text-2xs md:mt-4 text-background/70">
            &copy; {currentYear} Queer Guide
          </p>
        </div>
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 128 32"
          fill="none"
          className="footer-route-drawing pointer-events-none absolute bottom-0 end-6 h-6 w-24 sm:w-32"
        >
          <path className="footer-route-blue" d="M4 26h36C56 26 56 6 72 6h52" />
          <path className="footer-route-pink" d="M4 26h32c16 0 16-10 32-10h56" />
          <circle className="footer-route-green" cx="78" cy="16" r="3" />
          <circle className="footer-route-yellow" cx="110" cy="6" r="3" />
        </svg>
      </div>
    </footer>
  );
}
