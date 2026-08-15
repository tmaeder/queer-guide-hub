import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { CurrencySelector } from '@/components/i18n/CurrencySelector';
import { cn } from '@/lib/utils';
import { INTENT_NAV, INTENT_TRACK, isIntentActive } from '@/config/navigation';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MasterSymbol } from '@/components/brand/MasterSymbol';
import { TrackSwatch } from '@/components/transit/TrackSwatch';
import { PAGE_GUTTER } from '@/components/layout/PageContainer';
import { FooterTracks } from './FooterTracks';

/**
 * Footer — the station map at the end of the line
 * ("Header and Footer.dc.html", panel 06).
 *
 * Structure is load-bearing and specified, not stylistic:
 *   1. two crossing track lines, so the page ends on the metaphor it opened on
 *   2. columns are TRACKS, not a sitemap dump — one per intent, each led by its
 *      own line swatch, so the footer teaches the same six jobs the topbar does
 *   3. the anti-discrimination policy and the crisis lines sit ABOVE the legal
 *      row, "because that is the order of importance, not the order of
 *      convention"
 *   4. legal + tagline last
 *
 * Ink flood throughout: this is the one drenched plate on the page.
 */

/** Site/meta links. Deliberately NOT a third nav source — the track columns
 *  above are single-sourced from INTENT_NAV; these are the legal/meta row. */
const legalLinks = [
  { href: '/privacy', labelKey: 'footer.privacy', fallback: 'Privacy' },
  { href: '/terms', labelKey: 'footer.terms', fallback: 'Terms' },
  { href: '/legal', labelKey: 'footer.legalLink', fallback: 'Legal' },
  { href: '/accessibility', labelKey: 'header.legal.accessibility', fallback: 'Accessibility' },
  { href: '/contributors', labelKey: 'footer.contributors', fallback: 'Contributors' },
  { href: '/about', labelKey: 'footer.about', fallback: 'About' },
  { href: '/contact', labelKey: 'footer.contact', fallback: 'Contact' },
  { href: '/donate', labelKey: 'footer.supportUs', fallback: 'Support Us' },
];

export function Footer() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const currentYear = new Date().getFullYear();
  const localePath = pathname.replace(/^\/(?:[a-z]{2}\/)?/, '/');

  return (
    <footer className="mt-auto bg-foreground text-background">
      <div className={cn('mx-auto w-full max-w-page pt-8', PAGE_GUTTER)}>
        <FooterTracks />
      </div>

      {/* ── Brand + track columns. One column per intent, single-sourced from
           INTENT_NAV so the footer can never drift from the topbar (the defect
           class that put /venues and /people out of reach of desktop chrome).
           The columns LINK now rather than describe: a footer's job is to be
           the site's index, and a subtitle paragraph under a heading is the
           one thing in a footer nobody has ever clicked. ─────────────── */}
      <div
        className={cn(
          'mx-auto grid w-full max-w-page grid-cols-2 gap-8 pb-8 pt-4 md:grid-cols-4 lg:grid-cols-8',
          PAGE_GUTTER,
        )}
      >
        <div className="col-span-2">
          <MasterSymbol className="w-28 text-background" />
          <p className="mt-4 max-w-[16rem] text-15 font-bold leading-snug">
            {t('footer.tagline', 'Every track. Every station. Everyone.')}
          </p>
        </div>

        <nav aria-label="Footer navigation" className="contents">
          {INTENT_NAV.map((intent) => {
            const active = isIntentActive(intent, localePath);
            const track = INTENT_TRACK[intent.id] ?? 'pink';
            return (
              <div key={intent.to}>
                <div className="mb-2 flex items-center gap-2">
                  <TrackSwatch track={track} tone="ink" />
                  <LocalizedLink
                    to={intent.to}
                    aria-current={active ? 'page' : undefined}
                    className="text-15 font-bold text-background no-underline underline-offset-4 hover:underline"
                  >
                    {t(intent.labelKey, intent.fallback)}
                  </LocalizedLink>
                </div>
                <ul>
                  {intent.children.map((child) => (
                    <li key={child.to}>
                      <LocalizedLink
                        to={child.to}
                        aria-current={localePath === child.to ? 'page' : undefined}
                        className="block py-1 text-13 leading-relaxed text-background/80 no-underline underline-offset-4 hover:text-background hover:underline"
                      >
                        {t(child.labelKey, child.fallback)}
                      </LocalizedLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </div>

      {/* ── Policy + crisis. Above the legal row on purpose. ──────────── */}
      <div className="border-t-[3px] border-background">
        <div className="mx-auto grid w-full max-w-page gap-8 py-8 md:grid-cols-2">
          <div>
            <h2 className="max-w-md font-display text-headline leading-tight">
              {t('footer.antiDiscrimination.title', "We don't do bigotry here.")}
            </h2>
            <p className="mt-2 max-w-lg text-13 leading-relaxed text-background/80">
              {t(
                'footer.antiDiscrimination.body',
                'Racism, transphobia, and discrimination are automatic grounds for getting booted off the platform. Period.',
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <LocalizedLink
                to="/report"
                className="border-2 border-background px-4 py-2 text-xs2 font-bold text-background no-underline hover:bg-background hover:text-foreground"
              >
                {t('footer.reportSomething', 'Report something')}
              </LocalizedLink>
              <LocalizedLink
                to="/help"
                className="border-2 border-background px-4 py-2 text-xs2 font-bold text-background no-underline hover:bg-background hover:text-foreground"
              >
                {t('footer.hotlines', 'Hotlines')}
              </LocalizedLink>
            </div>
          </div>

          <div>
            <div className="text-2xs font-bold uppercase tracking-label text-background/70">
              {t('footer.emergency.eyebrow', 'In an emergency')}
            </div>
            {/* The crisis block is a link, not a card with a link in it: on the
                one surface where seconds matter the whole box is the target. */}
            <LocalizedLink
              to="/help"
              className="mt-2 block border-[3px] border-background p-4 text-background no-underline hover:bg-background hover:text-foreground"
            >
              <span className="block text-title font-bold">
                {t('footer.emergency.title', 'Crisis lines, 24 hours')}
              </span>
              <span className="mt-1.5 block text-13 leading-relaxed">
                {t(
                  'footer.emergency.body',
                  'Trans helpline, LGBT+ crisis support, and local emergency numbers, listed by country and always one click from any page.',
                )}
              </span>
            </LocalizedLink>
          </div>
        </div>
      </div>

      {/* ── Legal row. The mock closes on a light hairline, not another heavy
           rule: by here the plate has already been divided twice and a third
           3px band reads as a fourth section rather than a footnote. The mark
           and tagline are NOT repeated — they open the plate now. ────── */}
      <div className="border-t border-background/25">
        <div
          className={cn(
            'mx-auto flex w-full max-w-page flex-wrap items-center justify-between gap-4 py-6',
            PAGE_GUTTER,
          )}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {legalLinks.map((link) => (
              <LocalizedLink
                key={link.href}
                to={link.href}
                aria-current={localePath === link.href ? 'page' : undefined}
                className="text-13 text-background/80 no-underline hover:text-background hover:underline underline-offset-4"
              >
                {t(link.labelKey, link.fallback)}
              </LocalizedLink>
            ))}
            {/* The spec's bottom row ends on a bare "© 2026". The site name is
                kept here because the footer is the only place it appears as
                text once the header wordmark became a graphic — dropping it
                left the page with no machine-readable owner. */}
            <span className="text-13 text-background/60">&copy; {currentYear} Queer Guide</span>
            {/* ODbL attribution for the city-card transit diagrams, which are a
                derived work of OSM route relations. The map canvas carries its
                own attribution control; the diagrams render outside any map, so
                the credit has to live somewhere on the page. */}
            <span className="text-13 text-background/60">
              {t(
                'footer.osmAttribution',
                'Transit diagrams derived from © OpenStreetMap contributors (ODbL)',
              )}
            </span>
          </div>
        </div>
        <div
          className={cn(
            'mx-auto flex w-full max-w-page flex-wrap items-center gap-2 pb-6',
            PAGE_GUTTER,
          )}
        >
          <LanguageSwitcher />
          <CurrencySelector />
        </div>
      </div>
    </footer>
  );
}
