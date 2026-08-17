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
      {/* FULL-BLEED, deliberately outside the page cap and the gutter. A track
          runs to the edge of the map or it is not a track — capping it at
          max-w-page and then insetting it by the gutter left a margin of dead
          ink on both sides and made the lines read as a decorative graphic
          dropped into a column rather than as the network the page sits on.
          Full-bleed bands stay full-bleed; only their CONTENT takes the cap. */}
      <FooterTracks />

      {/* ── Brand, then the track columns.
           The brand used to be a 2-wide COLUMN inside the same grid as the six
           intents, which made an eight-across row: at the 1600 cap each intent
           got ~180px, so every heading wrapped and the whole band read as a
           wall. Lifting the brand onto its own line gives the six columns the
           full measure and costs no vertical space, because the mark and the
           tagline sit side by side rather than stacked. ─────────────── */}
      <div className={cn('mx-auto w-full max-w-page pt-8', PAGE_GUTTER)}>
        <div className="flex items-center gap-4">
          <MasterSymbol className="w-20 shrink-0 text-background" />
          <p className="text-15 font-bold leading-snug">
            {t('footer.tagline', 'Every track. Every station. Everyone.')}
          </p>
        </div>

        {/* One column per intent, single-sourced from INTENT_NAV (including
            `children`) so the footer can never drift from the topbar — the
            defect that once put /venues and /people out of reach of desktop
            chrome. The columns LINK rather than describe: a subtitle paragraph
            under a heading is the one thing in a footer nobody clicks. */}
        <nav
          aria-label="Footer navigation"
          className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 lg:grid-cols-6"
        >
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
                        className="block py-1 text-13 text-background/70 no-underline underline-offset-4 hover:text-background hover:underline"
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

      {/* ── Safety. Above the legal row on purpose: that is the order of
           importance, not the order of convention.

           One band, not two. The anti-discrimination copy and the crisis card
           were separate blocks of near-equal weight — two 32px headlines
           competing at the foot of the page, which is what made this part read
           as cluttered. The policy is the quiet half now and the crisis card
           is the loud one, because only one of them is something a reader
           might need in the next thirty seconds. ────────────────────────── */}
      <div className="mt-10 border-t border-background">
        <div
          className={cn(
            'mx-auto grid w-full max-w-page items-start gap-8 py-8 md:grid-cols-2',
            PAGE_GUTTER,
          )}
        >
          <div>
            {/* Rank 4 is Space Grotesk 700, never Anton — dropping this from
                text-headline to text-title means dropping font-display with
                it (rankFourFace.test.ts). */}
            <h2 className="max-w-md text-title font-bold leading-tight">
              {t('footer.antiDiscrimination.title', "We don't do bigotry here.")}
            </h2>
            <p className="mt-4 max-w-md text-13 leading-relaxed text-background/70">
              {t(
                'footer.antiDiscrimination.body',
                'Racism, transphobia, and discrimination are automatic grounds for getting booted off the platform. Period.',
              )}
            </p>
            <LocalizedLink
              to="/report"
              className="border mt-4 inline-block border-background px-4 py-2 text-xs2 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground"
            >
              {t('footer.reportSomething', 'Report something')}
            </LocalizedLink>
          </div>

          {/* The crisis block is a link, not a card with a link in it: on the
              one surface where seconds matter the whole box is the target.
              Its own title says what it is, so the "In an emergency" eyebrow
              that sat above it was a third heading saying the same thing. */}
          <LocalizedLink
            to="/help"
            className="border block border-background p-6 text-background no-underline transition-colors hover:bg-background hover:text-foreground"
          >
            <span className="block font-display text-headline leading-tight">
              {t('footer.emergency.title', 'Crisis lines, 24 hours')}
            </span>
            <span className="mt-4 block text-13 leading-relaxed">
              {t(
                'footer.emergency.body',
                'Trans helpline, LGBT+ crisis support, and local emergency numbers, listed by country and always one click from any page.',
              )}
            </span>
          </LocalizedLink>
        </div>
      </div>

      {/* ── Legal. A light hairline, not another heavy rule: by here the plate
           has been divided twice and a third 3px band reads as a fourth
           section rather than a footnote.

           Two tiers on purpose. Navigation and locale sit on the first line;
           the credits — copyright and the ODbL attribution — drop to a quieter
           second line. Inline, all of it competed with the legal links at the
           same size and turned the last line into a paragraph. ────────── */}
      <div className="border-t border-background/25">
        <div
          className={cn(
            'mx-auto flex w-full max-w-page flex-wrap items-center gap-x-6 gap-y-2 pt-6',
            PAGE_GUTTER,
          )}
        >
          {legalLinks.map((link) => (
            <LocalizedLink
              key={link.href}
              to={link.href}
              aria-current={localePath === link.href ? 'page' : undefined}
              className="text-13 text-background/70 no-underline underline-offset-4 hover:text-background hover:underline"
            >
              {t(link.labelKey, link.fallback)}
            </LocalizedLink>
          ))}
          {/* Both switchers are shared components built for a PAPER surface:
              they render ghost buttons at `text-foreground`, which on this ink
              plate is ink-on-ink — measured `color: rgb(17,17,17)`, i.e. two
              ~100px-wide controls that were completely invisible on every
              page. Recoloured here rather than in the components, which are
              correct where they are used on paper. */}
          <span className="ms-auto flex flex-wrap items-center gap-2 [&_button]:text-background [&_button:hover]:bg-background [&_button:hover]:text-foreground">
            <LanguageSwitcher />
            <CurrencySelector />
          </span>
        </div>

        <div
          className={cn(
            'mx-auto flex w-full max-w-page flex-wrap items-center gap-x-4 gap-y-1 pb-8 pt-4',
            PAGE_GUTTER,
          )}
        >
          {/* The spec's bottom row ends on a bare "© 2026". The site name is
              kept because the footer is the only place it appears as TEXT once
              the header wordmark became a graphic — dropping it left the page
              with no machine-readable owner. */}
          <span className="text-2xs text-background/50">&copy; {currentYear} Queer Guide</span>
          {/* ODbL attribution for the city-card transit diagrams, a derived
              work of OSM route relations. The map canvas carries its own
              attribution control; these diagrams render outside any map, so
              the credit has to live somewhere on the page. */}
          <span className="text-2xs text-background/50">
            {t(
              'footer.osmAttribution',
              'Transit diagrams derived from © OpenStreetMap contributors (ODbL)',
            )}
          </span>
        </div>
      </div>
    </footer>
  );
}
