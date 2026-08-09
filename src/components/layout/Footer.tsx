import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { CurrencySelector } from '@/components/i18n/CurrencySelector';
import { cn } from '@/lib/utils';
import { INTENT_NAV, isIntentActive } from '@/config/navigation';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MasterSymbol } from '@/components/brand/MasterSymbol';

// Site/meta links only. The intent row above them is single-sourced from
// config/navigation.ts — this list used to be the site's third, hardcoded
// nav source, divergent from both the header and the mobile sheet.
const footerLinks = [
  { href: '/about', labelKey: 'footer.about' },
  { href: '/history', labelKey: 'footer.history' },
  { href: '/legal', labelKey: 'footer.legalLink' },
  { href: '/accessibility', labelKey: 'header.legal.accessibility' },
  { href: '/privacy', labelKey: 'footer.privacy' },
  { href: '/terms', labelKey: 'footer.terms' },
  { href: '/contact', labelKey: 'footer.contact' },
  { href: '/donate', labelKey: 'footer.supportUs' },
];

/**
 * Subway-map footer: the site's one ink flood. Paper type on ink, the master
 * symbol reversed, a pink line-swatch next to the tagline. Links keep their
 * single-sourced nav rows (header owns "Primary", mobile bar owns
 * "Navigation" — this landmark stays "Footer navigation").
 */
export function Footer() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const currentYear = new Date().getFullYear();
  const localePath = pathname.replace(/^\/(?:[a-z]{2}\/)?/, '/');

  return (
    <footer className="mt-auto bg-foreground text-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 md:px-8">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <MasterSymbol className="w-28 text-background" />
            <div className="mt-4 flex items-center gap-2 text-15 font-bold">
              <span className="h-2 w-6 rounded-full bg-track-pink" aria-hidden />
              {t('footer.tagline', 'Every track. Every station. Everyone.')}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-0.5">
            <LanguageSwitcher />
            <CurrencySelector />
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 min-w-11 text-background hover:bg-background/15"
              aria-label="Scroll to top"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <ChevronUp size={14} />
            </Button>
          </div>
        </div>

        <nav aria-label="Footer navigation" className="mt-8 flex flex-col gap-2">
          <div className="flex flex-wrap gap-0.5">
            {INTENT_NAV.map((intent) => {
              const active = isIntentActive(intent, localePath);
              return (
                <LocalizedLink
                  key={intent.to}
                  to={intent.to}
                  aria-current={active ? 'page' : undefined}
                  style={{ alignItems: 'center', minHeight: 44, padding: '4px 8px' }}
                  className="inline-flex no-underline"
                >
                  <span
                    className={cn(
                      'text-13 font-bold text-background transition-colors',
                      active ? 'underline decoration-track-pink decoration-2 underline-offset-4' : 'hover:underline underline-offset-4',
                    )}
                  >
                    {t(intent.labelKey, intent.fallback)}
                  </span>
                </LocalizedLink>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-0.5">
            {footerLinks.map((link) => {
              const active = localePath === link.href;
              return (
                // LocalizedLink, not Link: these are all locale-aware routes
                // under /:locale?, and a bare Link dropped an /ar reader back
                // to English mid-session.
                <LocalizedLink
                  key={link.href}
                  to={link.href}
                  aria-current={active ? 'page' : undefined}
                  style={{ alignItems: 'center', minHeight: 44, padding: '4px 8px' }}
                  className="inline-flex no-underline"
                >
                  <span
                    className={cn(
                      'text-xs text-background/80 transition-colors',
                      active ? 'font-semibold underline underline-offset-4' : 'hover:text-background',
                    )}
                  >
                    {t(link.labelKey)}
                  </span>
                </LocalizedLink>
              );
            })}
          </div>
        </nav>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-background/20 pt-4 text-xs text-background/70">
          <span>&copy; {currentYear} Queer Guide · queer.guide</span>
          <span>{t('footer.madeWith', 'Made with, and for, love.')}</span>
        </div>
      </div>
    </footer>
  );
}
