/**
 * TestingSitesBand — HIV / hepatitis / STI testing locations, in-product.
 *
 * Replaces an outbound link to testfinder.info that sat on the STI guide and
 * the STI tag profile. The data still comes from the European Test Finder and
 * every rendering credits it, but the reader no longer has to leave to answer
 * "where do I actually go".
 *
 * TWO THINGS ARE DELIBERATE AND SHOULD NOT BE "TIDIED AWAY":
 *
 * 1. THE FRESHNESS STAMP IS ALWAYS SHOWN, never hidden when old. Much of this
 *    corpus was last confirmed by its operator in 2021. A clinic that moved is
 *    a wasted trip for someone who may have travelled to get there, so the age
 *    of the claim is part of the claim. Hiding it would make the data look
 *    better than it is.
 *
 * 2. NO OPENING-HOURS "OPEN NOW" BADGE. The hours are free text in ~40 formats
 *    across 46 countries ("Mondays, every other week (even weeks). From
 *    4pm-6pm.") and are as old as the rest of the record. Rendering them
 *    verbatim is honest; computing an open/closed state from them would be a
 *    confident guess about whether someone can get tested today.
 *
 * Motion-free by construction: this is health content and sits one click from
 * the crisis surfaces, so it follows the /help convention rather than the
 * homepage one.
 */

import { useTranslation } from 'react-i18next';
import { Building2, ChevronRight, Clock, Globe, MapPin, Phone } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { useTestingSites, type TestingSite } from '@/hooks/useOrganization';

const SERVICE_LABELS: Record<string, string> = {
  'hiv-testing': 'HIV',
  'sti-testing': 'STI',
  'hepatitis-testing': 'Hepatitis',
  'rapid-test': 'Rapid test',
  'free-testing': 'Free for some',
  'walk-in': 'Walk-in',
  'appointment-required': 'By appointment',
  'no-referral-needed': 'No referral',
  'sti-treatment': 'Treatment',
  'testing-counselling': 'Counselling',
  prep: 'PrEP',
  pep: 'PEP',
};

/** Order the chips so the test types lead; everything else keeps vocab order. */
const CHIP_ORDER = [
  'hiv-testing',
  'sti-testing',
  'hepatitis-testing',
  'prep',
  'pep',
  'rapid-test',
  'walk-in',
  'appointment-required',
  'no-referral-needed',
  'free-testing',
  'sti-treatment',
  'testing-counselling',
];

function detail(site: TestingSite, key: string): string | null {
  const tf = (site.enrichment_status as { testfinder?: Record<string, unknown> } | null)
    ?.testfinder;
  const value = tf?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sourceStamp(site: TestingSite): string | null {
  const provenance = (
    site as unknown as {
      field_provenance?: { source?: { source_last_updated?: string } };
    }
  ).field_provenance;
  return provenance?.source?.source_last_updated ?? null;
}

function SiteCard({ site }: { site: TestingSite }) {
  const { t } = useTranslation();
  const hours = detail(site, 'opening_hours');
  const stamp = sourceStamp(site);
  const chips = CHIP_ORDER.filter((slug) => site.tags?.includes(slug));

  return (
    <li className="relative border-b border-border-hairline last:border-b-0">
      <div className="flex flex-col gap-2 py-4">
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-border-hairline rounded-element text-muted-foreground">
            <Building2 size={14} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-title font-bold leading-tight">
              <LocalizedLink
                to={`/organizations/${site.slug}`}
                className="text-inherit no-underline hover:underline"
              >
                {site.name}
              </LocalizedLink>
            </h3>
            {site.address && (
              <p className="mt-1 flex items-start gap-1.5 text-13 text-muted-foreground">
                <MapPin size={13} className="mt-0.5 shrink-0" aria-hidden />
                <span className="min-w-0">{site.address}</span>
              </p>
            )}
          </div>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((slug) => (
              <Badge key={slug} variant="outline" className="text-2xs">
                {SERVICE_LABELS[slug] ?? slug}
              </Badge>
            ))}
          </div>
        )}

        {hours && (
          <p className="flex items-start gap-1.5 text-13 text-muted-foreground">
            <Clock size={13} className="mt-0.5 shrink-0" aria-hidden />
            <span className="min-w-0">{hours}</span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4 text-13">
          {site.phone && (
            <a href={`tel:${site.phone}`} className="inline-flex items-center gap-1.5 no-underline">
              <Phone size={13} aria-hidden />
              {site.phone}
            </a>
          )}
          {site.website && (
            <a
              href={site.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 no-underline"
            >
              <Globe size={13} aria-hidden />
              {t('testing.visit_site', 'Website')}
            </a>
          )}
        </div>

        {/* Always rendered when known — see the header comment. */}
        {stamp && (
          <p className="text-2xs text-muted-foreground">
            {t('testing.confirmed_on', 'Details last confirmed by the provider on')}{' '}
            <time dateTime={stamp}>{stamp}</time>.{' '}
            {t('testing.check_before', 'Check before you travel.')}
          </p>
        )}
      </div>
    </li>
  );
}

export function TestingSitesBand({
  countryCode,
  cityId,
  lat,
  lng,
  limit = 8,
  headingId = 'testing-sites',
}: {
  countryCode?: string;
  cityId?: string;
  lat?: number;
  lng?: number;
  limit?: number;
  headingId?: string;
}) {
  const { t } = useTranslation();
  const { data: sites = [], isLoading } = useTestingSites({
    countryCode,
    cityId,
    lat,
    lng,
    limit,
    // No place at all would return a effectively random global slice, which
    // reads as "your nearest clinic" and is not.
    enabled: Boolean(countryCode || cityId || (lat != null && lng != null)),
  });

  // Deliberately NOT `return null` when empty. This band replaced a plain
  // outbound link to testfinder.info; rendering nothing on an empty result
  // would silently remove the only answer the page previously had. Empty
  // degrades to exactly the old behaviour — the coverage note below always
  // renders and always links out.
  return (
    <section className="mt-12 border-t border-border-hairline pt-8" aria-labelledby={headingId}>
      <h2 id={headingId} className="font-display text-headline leading-tight">
        {t('testing.where_to_test', 'Where to get tested')}
      </h2>

      {isLoading ? (
        <div className="mt-6 flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={96} className="rounded-container" />
          ))}
        </div>
      ) : sites.length === 0 ? (
        <p className="mt-4 text-15 leading-relaxed text-muted-foreground">
          {t('testing.none_here', 'No testing locations on record for this area yet.')}
        </p>
      ) : (
        <ul className="m-0 mt-4 list-none border-t border-border-hairline p-0">
          {sites.map((site) => (
            <SiteCard key={site.id} site={site} />
          ))}
        </ul>
      )}

      <div className="mt-6">
        <CoverageNote>
          {t(
            'testing.coverage',
            'Testing locations come from the European Test Finder, a public-health directory run by EuroTEST/CHIP at Rigshospitalet, University of Copenhagen. It does not cover everywhere, and we cannot vouch for a provider’s current hours or services — contact them before visiting.',
          )}{' '}
          <a
            href="https://testfinder.info/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            testfinder.info
          </a>
        </CoverageNote>
      </div>

      <LocalizedLink
        to="/organizations?role=support"
        className="mt-4 inline-flex items-center gap-1 px-4 py-2 text-13 font-bold no-underline transition-colors hover:bg-foreground hover:text-background"
      >
        {t('testing.browse_all', 'Browse all support organizations')}
        <ChevronRight size={14} aria-hidden />
      </LocalizedLink>
    </section>
  );
}
