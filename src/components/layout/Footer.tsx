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
import { ink, paper } from '@/components/transit/iconDefs';
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
      <footer data-site-footer className="mt-auto py-4 md:py-8">
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
    <footer data-site-footer className="mt-auto py-4 md:py-8">
      <div
        className={cn(
          'island-capped rounded-panel bg-foreground py-2 text-background md:py-4',
          PAGE_GUTTER,
        )}
      >
        <nav
          aria-label="Footer navigation"
          className="grid grid-cols-2 gap-x-4 gap-y-0 md:flex md:flex-wrap md:gap-x-6"
        >
          {INTENT_NAV.map((intent) => (
            <LocalizedLink
              key={intent.to}
              to={intent.to}
              data-track={INTENT_TRACK[intent.id]}
              aria-current={isIntentActive(intent, localePath) ? 'page' : undefined}
              className={cn(
                footerLink,
                'footer-destination gap-1 text-15 font-bold leading-snug text-background md:gap-2 md:text-title aria-[current=page]:underline',
              )}
            >
              <span
                aria-hidden="true"
                className="footer-destination-icon inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-badge"
                style={{ backgroundColor: paper, color: ink }}
              >
                <intent.icon size={24} />
              </span>
              <span>{t(intent.labelKey, intent.fallback)}</span>
            </LocalizedLink>
          ))}
        </nav>
        <div className="mt-2 flex flex-wrap items-start gap-x-2 md:gap-x-6">
          <LocalizedLink to={REPORT_HREF} className={footerLink}>
            {t('footer.report', 'Report')}
          </LocalizedLink>
          <LocalizedLink to="/help" className={footerLink}>
            {t('footer.crisisSupport', 'Crisis support')}
          </LocalizedLink>
          <LocalizedLink to="/privacy" className={footerLink}>
            {t('footer.privacy', 'Privacy')}
          </LocalizedLink>
          <LocalizedLink to="/terms" className={footerLink}>
            {t('footer.terms', 'Terms')}
          </LocalizedLink>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(OPEN_COOKIE_PREFERENCES_EVENT))}
            className={cn(footerLink, 'text-start')}
          >
            {t('footer.cookiePreferences', 'Cookie preferences')}
          </button>
          <details className="group min-w-0 max-w-full open:basis-full">
            <summary
              className={cn(footerLink, 'flex w-fit cursor-pointer gap-2 text-background/75')}
            >
              {t('footer.siteInformation', 'Site information')}
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                fill="none"
                className="h-4 w-4 shrink-0 group-open:rotate-180"
              >
                <path
                  d="m4 6 4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>
            <nav
              aria-label={t('footer.siteInformation', 'Site information')}
              className="grid grid-cols-2 gap-x-4 pb-2 md:flex md:flex-wrap md:gap-x-6"
            >
              {legalLinks
                .filter((link) => link.href !== '/privacy' && link.href !== '/terms')
                .map((link) => (
                  <LocalizedLink
                    key={link.href}
                    to={link.href}
                    aria-current={localePath === link.href ? 'page' : undefined}
                    className={cn(footerLink, 'text-background/75 hover:text-background')}
                  >
                    {t(link.labelKey, link.fallback)}
                  </LocalizedLink>
                ))}
              <a
                href="/docs"
                className={cn(footerLink, 'text-background/75 hover:text-background')}
              >
                {t('footer.apiDocs', 'API & agents')}
              </a>
            </nav>
          </details>
        </div>
        <div className="flex flex-col gap-0 md:mt-2 md:flex-row md:items-center md:justify-between md:gap-x-8">
          <div className="flex flex-wrap items-center gap-0 sm:gap-2 [&_button]:!px-1 sm:[&_button]:!px-2 [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:text-background [&_button:hover]:underline">
            <LanguageSwitcher />
            <CurrencySelector />
            <ThemeToggle />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 md:gap-x-8">
            <LocalizedLink
              to="/"
              className={cn(footerLink, 'hover:no-underline')}
              aria-label={siteName}
            >
              <Wordmark className="text-title text-background" />
            </LocalizedLink>
            <p className="text-2xs text-background/70">&copy; {currentYear} Queer Guide</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
