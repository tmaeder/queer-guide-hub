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

/**
 * The directories this band can draw from.
 *
 * `list_testing_sites` selects on roles + service tags, NOT on provenance, so
 * every health directory we import lands here automatically. That is the point
 * — and it is also why nothing below may hardcode one source. Until 2026-08-30
 * this file read `enrichment_status.testfinder` and credited testfinder.info
 * unconditionally; the moment a second directory (the Swiss national registry,
 * ~150 Swiss centres against testfinder's 9) started publishing, that would
 * have attributed a Swiss federal registry entry to a Danish university.
 *
 * `enrichmentKey` is separate from the provenance name because the testfinder
 * corpus was written before the importer was generic and its detail object is
 * filed under 'testfinder', not 'european-test-finder'. Renaming 530 live rows
 * to tidy that up is a migration with no user-visible benefit.
 */
const DIRECTORIES: Record<string, { enrichmentKey: string; href: string; credit: string }> = {
  'european-test-finder': {
    enrichmentKey: 'testfinder',
    href: 'https://testfinder.info/',
    credit:
      'the European Test Finder, a public-health directory run by EuroTEST/CHIP at Rigshospitalet, University of Copenhagen',
  },
  'aids-ch': {
    enrichmentKey: 'aids-ch',
    href: 'https://aids.ch/en/addresses/',
    credit:
      'the Swiss AIDS Federation’s directory of counselling, testing and treatment centres (repertoire-sante-sexuelle.ch)',
  },
};

const FALLBACK_DIRECTORY = 'european-test-finder';

function sourceName(site: TestingSite): string {
  const provenance = (site as unknown as { field_provenance?: { source?: { name?: string } } })
    .field_provenance;
  const name = provenance?.source?.name;
  return name && DIRECTORIES[name] ? name : FALLBACK_DIRECTORY;
}

function detail(site: TestingSite, key: string): string | null {
  const bucket = (site.enrichment_status as Record<string, unknown> | null)?.[
    DIRECTORIES[sourceName(site)].enrichmentKey
  ] as Record<string, unknown> | undefined;
  const value = bucket?.[key];
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
  // Some directories publish hours as a link rather than as text. Linking out
  // is strictly better than the free text — it is the provider's own page and
  // cannot go stale in our copy — but it is only offered when there is no text,
  // so nothing that renders today loses its hours.
  const hoursUrl = detail(site, 'opening_hours_url');
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

        {hours ? (
          <p className="flex items-start gap-1.5 text-13 text-muted-foreground">
            <Clock size={13} className="mt-0.5 shrink-0" aria-hidden />
            <span className="min-w-0">{hours}</span>
          </p>
        ) : hoursUrl ? (
          <p className="flex items-start gap-1.5 text-13 text-muted-foreground">
            <Clock size={13} className="mt-0.5 shrink-0" aria-hidden />
            <a href={hoursUrl} target="_blank" rel="noopener noreferrer" className="min-w-0">
              {t('testing.opening_hours_link', 'Opening hours on the provider’s site')}
            </a>
          </p>
        ) : null}

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
  plate,
}: {
  countryCode?: string;
  cityId?: string;
  lat?: number;
  lng?: number;
  limit?: number;
  headingId?: string;
  /**
   * Plate number, when this band is a numbered plate in a host page's sequence
   * (the STI guide runs 01–04 and this is 04). Opt-in: on a tag page the band
   * is a section among many with no numbering to join, and it keeps its
   * `text-headline` rank there. Without this the STI guide's own route strip
   * listed it as station "4" over a heading that carried no number and sat a
   * rank below the three plates above it — the strip promised a sequence the
   * page did not deliver.
   */
  plate?: string;
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

  // Credit the directories actually on screen, in a stable order, and fall back
  // to the default one when the list is empty — the note always renders (see
  // below), so it always needs something to name.
  const present = new Set(sites.map(sourceName));
  const credited = Object.keys(DIRECTORIES).filter((name) => present.has(name));
  if (credited.length === 0) credited.push(FALLBACK_DIRECTORY);

  // Deliberately NOT `return null` when empty. This band replaced a plain
  // outbound link to testfinder.info; rendering nothing on an empty result
  // would silently remove the only answer the page previously had. Empty
  // degrades to exactly the old behaviour — the coverage note below always
  // renders and always links out.
  return (
    <section
      className={
        plate
          ? 'mt-16 border-t-2 border-foreground pt-6'
          : 'mt-12 border-t border-border-hairline pt-8'
      }
      aria-labelledby={headingId}
    >
      {plate ? (
        <div className="flex items-baseline gap-4">
          <span aria-hidden="true" className="font-display text-headline">
            {plate}
          </span>
          <h2 id={headingId} className="scroll-mt-24 font-display text-display">
            {t('testing.where_to_test', 'Where to get tested')}
          </h2>
        </div>
      ) : (
        <h2 id={headingId} className="scroll-mt-24 font-display text-headline leading-tight">
          {t('testing.where_to_test', 'Where to get tested')}
        </h2>
      )}

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
          {t('testing.coverage_lead', 'Testing locations come from')}{' '}
          {credited.map((name, i) => (
            <span key={name}>
              {i > 0 && (i === credited.length - 1 ? ' and ' : ', ')}
              {DIRECTORIES[name].credit} (
              <a
                href={DIRECTORIES[name].href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                {new URL(DIRECTORIES[name].href).hostname.replace(/^www\./, '')}
              </a>
              )
            </span>
          ))}
          .{' '}
          {t(
            'testing.coverage_caveat',
            'These directories do not cover everywhere, and we cannot vouch for a provider’s current hours or services — contact them before visiting.',
          )}
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
