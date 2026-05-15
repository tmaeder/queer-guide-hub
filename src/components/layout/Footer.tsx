import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { CurrencySelector } from '@/components/i18n/CurrencySelector';

const footerLinks = [
  { href: '/about', labelKey: 'footer.about' },
  { href: '/legal', labelKey: 'footer.legalLink' },
  { href: '/accessibility', labelKey: 'header.legal.accessibility' },
  { href: '/privacy', labelKey: 'footer.privacy' },
  { href: '/terms', labelKey: 'footer.terms' },
  { href: '/contact', labelKey: 'footer.contact' },
  { href: '/donate', labelKey: 'footer.supportUs' },
];

export function Footer() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-background/70 backdrop-blur-xl border-t border-border/50 mt-auto">
      <div className="w-full px-4 sm:px-6 md:px-8 py-3 flex flex-col md:flex-row items-center justify-center md:justify-between gap-2">
        <div className="flex flex-col items-center gap-0.5 order-2 md:order-1 md:flex-1">
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap justify-center gap-0.5"
          >
            {footerLinks.map((link, i) => (
              <div key={link.href} className="flex items-center gap-0.5">
                {i > 0 && (
                  <span className="text-xs text-muted-foreground" aria-hidden>
                    ·
                  </span>
                )}
                <Link
                  to={link.href}
                  style={{
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 24,
                    padding: '4px 6px',
                  }}
                >
                  <span className="text-xs text-muted-foreground hover:text-primary transition-colors">
                    {t(link.labelKey)}
                  </span>
                </Link>
              </div>
            ))}
          </nav>

          <span className="text-muted-foreground" style={{ fontSize: '0.65rem' }}>
            &copy; {currentYear} Queer Guide
          </span>
        </div>

        <div className="flex items-center justify-center flex-wrap gap-0.5 order-1 md:order-2">
          <LanguageSwitcher />
          <CurrencySelector />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            style={{ minWidth: 36, minHeight: 36 }}
            aria-label="Scroll to top"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <ChevronUp style={{ width: 14, height: 14 }} />
          </Button>
        </div>
      </div>
    </footer>
  );
}
