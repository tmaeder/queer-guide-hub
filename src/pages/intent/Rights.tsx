import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { CoverageNote } from '@/components/intent/CoverageNote';
import {
  useAllCountriesRightsFull,
  useIntentNews,
  type RightsCountry,
} from '@/hooks/useIntentData';
import { summariseRightsWorldwide } from '@/lib/rights/rightsWorldSummary';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { hasAnyCriminalizationSignal, deathPenaltyRisk } from '@/utils/equalityScore';
import { RightsScopeBar } from '@/components/rights/RightsScopeBar';
import { RightsCountryTable, type CountryFilter } from '@/components/rights/RightsCountryTable';
import { RightsLedger } from '@/components/rights/RightsLedger';
import { RightsMapSection } from '@/components/rights/RightsMapSection';
import { topicBySlug, type RightTopic } from '@/lib/rights/rightsCatalog';
import type { RightsLens } from '@/lib/rights/rightsClassify';
import { summariseMapClasses, type MapClass } from '@/lib/rights/rightsMapModel';
import type { SectionDef } from '@/components/entity/editorial';
import { scrollToIdSettled } from '@/lib/scrollSettle';

/**
 * `/rights` — LGBTQ+ law and safety, country by country.
 *
 * The nav label is "Rights", not "Know your rights". We hold no residency,
 * citizenship, gender marker or partnership status for the reader, so we cannot
 * tell anyone what *their* rights are; promising that would be the most
 * dangerous overclaim on the site. What we do hold is the legal status of all
 * 250 countries and territories — the only dataset here with full coverage —
 * so this page is phrased as an index, not as advice.
 *
 * Animation-free by the crisis-adjacent rule: someone may open this while
 * deciding whether a place is safe to enter.
 *
 * Layout (2026-08-21 restructure, docs/plans/2026-08-21-rights-restructure-design.md):
 * hero + scope band (lookup · here-line · headline stats) → ONE filterable
 * country table → "Still a crime" prose band → the 18-rights ledger → tail.
 * All country-level content lives in the table; all right-level content in the
 * ledger. /country/:slug stays the answer; this page stays the index.
 */
export default function RightsIntent() {
  const { t } = useTranslation();
  const { data: countries, isLoading, error } = useAllCountriesRightsFull();

  // Country-table filter is lifted here so the scope-bar tiles and the
  // "Still a crime" band can preset it.
  const [tableFilter, setTableFilter] = useState<CountryFilter>('all');

  const rightsSummary = summariseRightsWorldwide(
    (countries ?? []) as unknown as Record<string, unknown>[],
  );
  const { countryCode } = useIntentLocation();
  const navigate = useLocalizedNavigate();

  // World-map state — see docs/plans/2026-08-22-rights-world-map-design.md
  // Task D. Default station is Same-sex activity (the safety question); the
  // lens defaults to the strict "everyone" reading.
  const [mapTopic, setMapTopic] = useState<RightTopic>(() => topicBySlug('criminalisation')!);
  const [mapLens, setMapLens] = useState<RightsLens>('all');
  const [mapActiveClass, setMapActiveClass] = useState<MapClass | null>(null);

  // A class filter picked on the previous right is meaningless on a new one
  // — leaving it set would silently dim most of the map for no visible
  // reason, so both control changes clear it.
  const handleMapTopicChange = (topic: RightTopic) => {
    setMapTopic(topic);
    setMapActiveClass(null);
  };
  const handleMapLensChange = (lens: RightsLens) => {
    setMapLens(lens);
    setMapActiveClass(null);
  };

  const mapCounts = useMemo(
    () =>
      summariseMapClasses(
        (countries ?? []) as unknown as Record<string, unknown>[],
        mapTopic,
        mapLens,
      ),
    [countries, mapTopic, mapLens],
  );

  const handleMapCountrySelect = (country: RightsCountry) => {
    if (!country.slug) return;
    navigate(`/country/${country.slug}`);
  };

  // Deep links into a single right (`/rights#marriage`), which is where the
  // glossary sends every class-of-law tag — see src/lib/rights/tagRightTopics.ts.
  //
  // The browser performs its fragment jump while this page is still a shell: the
  // topic rows need the all-countries fetch, so `#marriage` does not exist yet
  // and the reader is silently left at the top of a very long page. Measured on
  // a real load, both as a full navigation and as an in-app click: scrollY 0
  // with the target thousands of px down.
  //
  // WAITING ON A DEPENDENCY DOES NOT WORK HERE, which is the trap.
  // `summariseRightsWorldwide` maps over RIGHT_TOPICS, so `rightsSummary.length`
  // is 18 from the first render whether or not any country has loaded — keying
  // the effect on it fires once, immediately, against an empty DOM. So this
  // polls for the element itself rather than trying to guess when it appears.
  //
  // Once found it re-scrolls a few times, because the site header collapses to
  // its compact height after the first scroll and would otherwise leave the
  // target ~64px off (the same correction useActiveStation documents).
  //
  // A timer, NOT requestAnimationFrame: rAF is paused in a background or
  // zero-size tab, so a link opened in a new tab would never scroll — which is
  // exactly how someone following this from a tag page is likely to open it.
  // Timers still fire there (throttled), so the page is already in position when
  // they switch to it.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const STEP = 100;
    let waited = 0;
    let settling = 0;
    const timer = window.setInterval(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: 'start' });
        if (++settling >= 4) window.clearInterval(timer);
      } else if ((waited += STEP) > 10_000) {
        // The right does not exist. Leave the page where the reader put it.
        window.clearInterval(timer);
      }
    }, STEP);
    return () => window.clearInterval(timer);
  }, []);

  useMeta({
    title: 'LGBTQ+ rights and safety, country by country',
    description:
      'Legal status for LGBTQ+ people in all 250 countries and territories: criminalisation, partnership recognition and equality scores, with sources.',
    canonicalPath: '/rights',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'LGBTQ+ legal status by country',
      description:
        'Criminalisation status, partnership recognition and a composite equality score for every country and territory.',
      creator: { '@type': 'Organization', name: 'Queer Guide' },
      isAccessibleForFree: true,
    },
  });

  const here = useMemo(
    () =>
      countryCode && countries
        ? (countries.find((c) => c.code?.toLowerCase() === countryCode.toLowerCase()) ?? null)
        : null,
    [countries, countryCode],
  );

  const { data: news } = useIntentNews(here?.id ?? null, 5);

  /**
   * How many rows carry a legal status at all. `lgbti_criminalization` is
   * non-null on all 250 rows, but 11 of them hold an empty shape — the same 11
   * that have no equality score, all uninhabited territories. The note used to
   * render `{countries.length} of {countries.length}`, which prints "250 of
   * 250" whatever the data says and can never reveal a gap; the e2e test
   * asserted that tautology, so both agreed and neither could fail.
   */
  const withLegalStatus = useMemo(
    () =>
      (countries ?? []).filter(
        (c) => (c.lgbti_criminalization as Record<string, unknown> | null)?.legal != null,
      ).length,
    [countries],
  );

  const criminalizing = useMemo(
    () => (countries ?? []).filter((c) => hasAnyCriminalizationSignal(c.lgbti_criminalization)),
    [countries],
  );
  const deathConfirmed = useMemo(
    () => criminalizing.filter((c) => deathPenaltyRisk(c.lgbti_criminalization) === 'confirmed'),
    [criminalizing],
  );
  const deathPossible = useMemo(
    () => criminalizing.filter((c) => deathPenaltyRisk(c.lgbti_criminalization) === 'possible'),
    [criminalizing],
  );

  const marriageCount = rightsSummary.find((r) => r.topic.slug === 'marriage')?.yes ?? 0;

  const showInTable = (filter: 'criminalising' | 'death') => {
    setTableFilter(filter);
    scrollToIdSettled('world');
  };

  const sections: SectionDef[] = [
    {
      id: 'map',
      label: 'The map',
      kicker: 'Every country, one law at a time',
      hidden: !countries || countries.length === 0,
      content: (
        <RightsMapSection
          countries={countries ?? []}
          topic={mapTopic}
          onTopicChange={handleMapTopicChange}
          lens={mapLens}
          onLensChange={handleMapLensChange}
          activeClass={mapActiveClass}
          onActiveClassChange={setMapActiveClass}
          counts={mapCounts}
          onCountrySelect={handleMapCountrySelect}
        />
      ),
    },
    {
      id: 'world',
      label: 'The world',
      kicker: `All ${countries?.length ?? 0} countries and territories`,
      hidden: !countries || countries.length === 0,
      content: (
        <div>
          <CoverageNote>
            {withLegalStatus} of {countries?.length ?? 0} countries and territories carry a recorded
            criminalisation status. The remaining {(countries?.length ?? 0) - withLegalStatus} also
            carry no equality score and are listed as “not scored” rather than given a default or
            folded in with countries we have measured.
          </CoverageNote>
          <RightsCountryTable
            countries={countries ?? []}
            filter={tableFilter}
            onFilterChange={setTableFilter}
          />
        </div>
      ),
    },
    {
      id: 'criminalizing',
      label: 'Still a crime',
      kicker: 'Where same-sex acts are criminalised',
      hidden: !countries || countries.length === 0,
      content: (
        <div className="max-w-prose">
          <CoverageNote>
            {criminalizing.length} countries criminalise same-sex acts.{' '}
            {deathConfirmed.length > 0 ? `In ${deathConfirmed.length} the penalty is death.` : null}{' '}
            {deathPossible.length > 0
              ? `In ${deathPossible.length} more our source names the death penalty as possible but records no legal certainty; we list those as uncertain rather than as safe.`
              : null}{' '}
            Venues, events and organizations in these countries are hidden from signed-out visitors
            by design.
          </CoverageNote>
          {deathConfirmed.length > 0 ? (
            // Named in prose, never only behind a filter — this is the one
            // fact on the page that must not cost a click.
            <p className="mb-6">
              The penalty is death in {deathConfirmed.map((c) => c.name).join(', ')}.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => showInTable('criminalising')}
            className="bg-muted px-6 py-2 font-medium rounded-element"
          >
            See all {criminalizing.length} in the table
          </button>
        </div>
      ),
    },
    {
      id: 'rights',
      label: 'The rights themselves',
      kicker: 'Where each one stands worldwide',
      hidden: !countries || countries.length === 0,
      content: <RightsLedger summary={rightsSummary} />,
      action: (
        <LocalizedLink to="/rights/sources" className="text-13 no-underline hover:underline">
          How we know
        </LocalizedLink>
      ),
    },
    {
      id: 'news',
      label: 'In the news',
      content:
        news && news.length > 0 ? (
          <ul className="list-none p-0 m-0">
            {news.map((n) => (
              <li key={n.id} className="border-b border-border py-2">
                {n.slug ? (
                  <LocalizedLink to={`/news/${n.slug}`} className="no-underline hover:underline">
                    {n.title}
                  </LocalizedLink>
                ) : (
                  n.title
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No recent coverage.</p>
        ),
      action: (
        <LocalizedLink to="/news" className="text-13 no-underline hover:underline">
          All news
        </LocalizedLink>
      ),
    },
    {
      id: 'sources',
      label: 'Where this comes from',
      content: (
        <div className="max-w-prose">
          <p className="mb-4">
            Legal status on this page comes from the ILGA World Database and is re-imported nightly.
            The equality score is a 0–100 composite we compute from it.
          </p>
          <p className="text-muted-foreground">
            It opens at 50 and adds points per recorded right, so a country we hold little about
            lands mid-scale rather than reading as unknown — and it is a single number for very
            different lives. It describes law on paper, not enforcement, and it is not a safety
            rating.
          </p>
        </div>
      ),
      action: (
        <LocalizedLink to="/rights/sources" className="text-13 no-underline hover:underline">
          Sources and limits
        </LocalizedLink>
      ),
    },
    {
      id: 'help',
      label: 'If you need help',
      content: (
        <div className="flex flex-wrap gap-4">
          <LocalizedLink
            to="/support"
            className="bg-muted px-6 py-2 font-medium no-underline rounded-element"
          >
            Find support near you
          </LocalizedLink>
          <LocalizedLink
            to="/help"
            className="bg-muted px-6 py-2 font-medium no-underline rounded-element"
          >
            Crisis hotlines
          </LocalizedLink>
        </div>
      ),
    },
  ];

  return (
    <IntentPageLayout
      breadcrumbLabel={t('header.intents.rights.label', 'Rights')}
      breadcrumbHref="/rights"
      eyebrow="Know before you go"
      title="LGBTQ+ rights and safety, country by country"
      lede="Legal status for every country and territory we cover — criminalisation, partnership recognition, and how they compare. We can tell you what the law says; we cannot tell you what it means for your particular situation."
      scopeBar={
        countries && countries.length > 0 ? (
          <RightsScopeBar
            countries={countries}
            here={here}
            stats={{
              criminalising: criminalizing.length,
              deathConfirmed: deathConfirmed.length,
              marriage: marriageCount,
            }}
            onShowCriminalising={showInTable}
          />
        ) : null
      }
      sections={sections}
      loading={isLoading}
      error={(error as Error) ?? null}
      disableProgress
    />
  );
}
