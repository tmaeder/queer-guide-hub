import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { CurrencySelector } from '@/components/i18n/CurrencySelector';
import { cn } from '@/lib/utils';
import { INTENT_NAV, isIntentActive } from '@/config/navigation';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

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

export function Footer() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const currentYear = new Date().getFullYear();
  const localePath = pathname.replace(/^\/(?:[a-z]{2}\/)?/, '/');

  return (
    <footer className="bg-background/70 backdrop-blur-xl rule-heavy mt-auto">
      <div className="w-full px-4 sm:px-6 md:px-8 py-4 flex flex-col md:flex-row items-center justify-center md:justify-between gap-2">
        <div className="flex flex-col items-center gap-0.5 order-2 md:order-1 md:flex-1">
          {/* One landmark, two rows. A second <nav> here would need its own
              unique accessible name — the header already owns "Primary" and the
              mobile bar owns "Navigation", and duplicate landmark names break
              rotor navigation. */}
          <nav aria-label="Footer navigation" className="flex flex-col items-center gap-0.5">
            <div className="flex flex-wrap justify-center gap-0.5">
              {INTENT_NAV.map((intent, i) => {
                const active = isIntentActive(intent, localePath);
                return (
                  <div key={intent.to} className="flex items-center gap-0.5">
                    {i > 0 && (
                      <span className="text-xs text-muted-foreground" aria-hidden>
                        ·
                      </span>
                    )}
                    <LocalizedLink
                      to={intent.to}
                      aria-current={active ? 'page' : undefined}
                      style={{ alignItems: 'center', minHeight: 44, padding: '4px 8px' }}
                      className="no-underline inline-flex"
                    >
                      <span
                        className={cn(
                          'text-xs transition-colors',
                          active
                            ? 'text-foreground font-semibold underline underline-offset-4'
                            : 'text-foreground hover:text-primary',
                        )}
                      >
                        {t(intent.labelKey, intent.fallback)}
                      </span>
                    </LocalizedLink>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap justify-center gap-0.5">
              {footerLinks.map((link, i) => {
                const active = localePath === link.href;
                return (
                  <div key={link.href} className="flex items-center gap-0.5">
                    {i > 0 && (
                      <span className="text-xs text-muted-foreground" aria-hidden>
                        ·
                      </span>
                    )}
                    {/* LocalizedLink, not Link: these are all locale-aware
                      routes under /:locale?, and a bare Link dropped an /ar
                      reader back to English mid-session. */}
                    <LocalizedLink
                      to={link.href}
                      aria-current={active ? 'page' : undefined}
                      style={{ alignItems: 'center', minHeight: 44, padding: '4px 8px' }}
                      className="no-underline inline-flex"
                    >
                      <span
                        className={cn(
                          'text-xs transition-colors',
                          active
                            ? 'text-foreground font-semibold underline underline-offset-4'
                            : 'text-muted-foreground hover:text-primary',
                        )}
                      >
                        {t(link.labelKey)}
                      </span>
                    </LocalizedLink>
                  </div>
                );
              })}
            </div>
          </nav>

          <span className="text-muted-foreground" style={{ fontSize: '0.65rem' }}>
            &copy; {currentYear} Queer Guide
          </span>
        </div>

        <div className="flex items-center justify-center flex-wrap gap-0.5 order-1 md:order-2">
          <LanguageSwitcher />
          <CurrencySelector />
          <Button
            variant="ghost"
            size="sm"
            className="min-w-11 min-h-11"
            aria-label="Scroll to top"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <ChevronUp size={14} />
          </Button>
        </div>
      </div>
    </footer>
  );
}
