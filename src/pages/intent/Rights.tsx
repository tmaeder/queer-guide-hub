import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { useAllCountriesRights, useIntentNews, type RightsCountry } from '@/hooks/useIntentData';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import {
  hasAnyCriminalizationSignal,
  deathPenaltyRisk,
  tierForScore,
} from '@/utils/equalityScore';
import type { SectionDef } from '@/components/entity/editorial';

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
 */

type Tier = 'protected' | 'mixed' | 'restricted' | 'unscored';

const TIER_LABEL: Record<Tier, string> = {
  protected: 'Protected',
  mixed: 'Mixed',
  restricted: 'Restricted',
  unscored: 'Not scored',
};

const TIER_ORDER: readonly Tier[] = ['protected', 'mixed', 'restricted', 'unscored'];

/**
 * Bucket a country for the world list.
 *
 * These cutoffs deliberately do NOT come from `EQUALITY_TIER_CUTOFFS`, even
 * though that constant documents itself as the single source of truth and a
 * first pass at this page did adopt it. It is a score-MAGNITUDE scale
 * (very-high/high/moderate/low, breaking at 80/60/40/20); protected/mixed/
 * restricted is a rights-VERDICT scale. Mapping high→protected drops the
 * boundary from 75 to 60 and files North Korea (60), Bahrain (60), Turkey (61)
 * and Vatican City (62) under "Protected" on a page people read to decide
 * whether somewhere is safe to enter.
 *
 * The reason those countries score 60 at all is that `calculateEqualityScore`
 * starts every country at 50 and adds points, so a country with almost no ILGA
 * coverage lands near the middle by default rather than being marked unknown.
 * Until the score is replaced by a categorical verdict, a verdict word cannot
 * be derived from it at the boundary the magnitude scale uses.
 *
 * `unscored` is the honest half of the change and stays: an unscored country
 * used to fall into `mixed`, turning "we hold no data" into a positive claim
 * that partial protections exist.
 */
const PROTECTED_MIN = 75;
const MIXED_MIN = 40;

function tierOf(c: RightsCountry): Tier {
  if (hasAnyCriminalizationSignal(c.lgbti_criminalization)) return 'restricted';
  if (tierForScore(c.equality_score) === 'unknown') return 'unscored';
  const score = c.equality_score as number;
  if (score >= PROTECTED_MIN) return 'protected';
  return score >= MIXED_MIN ? 'mixed' : 'restricted';
}

function CountryLink({
  country,
  showDeathRisk = false,
}: {
  country: RightsCountry;
  /** Only in the criminalisation list, where the distinction changes a decision. */
  showDeathRisk?: boolean;
}) {
  const label = country.slug ? (
    <LocalizedLink to={`/country/${country.slug}`} className="no-underline hover:underline">
      {country.name}
    </LocalizedLink>
  ) : (
    <span>{country.name}</span>
  );
  const risk = showDeathRisk ? deathPenaltyRisk(country.lgbti_criminalization) : 'none';
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-border py-2">
      <span className="font-medium">
        {label}
        {risk === 'confirmed' ? (
          <span className="text-13 font-normal text-destructive"> · death penalty</span>
        ) : risk === 'possible' ? (
          <span className="text-13 font-normal text-muted-foreground">
            {' '}
            · death penalty possible
          </span>
        ) : null}
      </span>
      <span className="text-13 text-muted-foreground tabular-nums">
        {country.equality_score == null ? 'Not scored' : `${country.equality_score}/100`}
      </span>
    </li>
  );
}

export default function RightsIntent() {
  const { t } = useTranslation();
  const { data: countries, isLoading, error } = useAllCountriesRights();
  const { countryCode } = useIntentLocation();

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

  const buckets = useMemo(() => {
    const out: Record<Tier, RightsCountry[]> = {
      protected: [],
      mixed: [],
      restricted: [],
      unscored: [],
    };
    for (const c of countries ?? []) out[tierOf(c)].push(c);
    return out;
  }, [countries]);

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

  const sections: SectionDef[] = [
    {
      id: 'here',
      label: 'Where you are',
      kicker: 'Your current location',
      content: here ? (
        <div>
          <h3 className="font-display text-headline mb-2">{here.name}</h3>
          <p className="text-body-lg mb-4">
            {deathPenaltyRisk(here.lgbti_criminalization) === 'confirmed'
              ? 'Same-sex acts can carry the death penalty here.'
              : deathPenaltyRisk(here.lgbti_criminalization) === 'possible'
                ? 'Same-sex acts are criminalised here, and the death penalty may apply — our source records no legal certainty either way.'
                : hasAnyCriminalizationSignal(here.lgbti_criminalization)
                  ? 'Same-sex acts are criminalised here.'
                  : 'Same-sex acts are not criminalised here.'}
          </p>
          <p className="text-muted-foreground mb-6">
            Equality score:{' '}
            {here.equality_score == null ? 'not scored' : `${here.equality_score} out of 100`}.
          </p>
          {here.slug ? (
            <LocalizedLink
              to={`/country/${here.slug}`}
              className="font-medium underline underline-offset-4"
            >
              Full legal detail for {here.name}
            </LocalizedLink>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground">
          We could not determine your country from your connection. Pick any country below for its
          full legal profile.
        </p>
      ),
    },
    {
      id: 'world',
      label: 'The world',
      kicker: `All ${countries?.length ?? 0} countries and territories`,
      content: (
        <div>
          <CoverageNote>
            {withLegalStatus} of {countries?.length ?? 0} countries and territories carry a
            recorded criminalisation status. The remaining{' '}
            {(countries?.length ?? 0) - withLegalStatus} also carry no equality score and are
            listed as “not scored” rather than given a default or folded in with countries we
            have measured.
          </CoverageNote>
          <div className="grid gap-8 md:grid-cols-2">
            {TIER_ORDER.map((tier) => (
              <div key={tier}>
                <h3 className="font-display text-title mb-2">{TIER_LABEL[tier]}</h3>
                <p className="text-13 text-muted-foreground mb-4">
                  {buckets[tier].length} countries
                </p>
                <ul className="list-none p-0 m-0">
                  {buckets[tier].map((c) => (
                    <CountryLink key={c.id} country={c} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'criminalizing',
      label: 'Still a crime',
      kicker: 'Where same-sex acts are criminalised',
      content: (
        <div>
          <CoverageNote>
            {criminalizing.length} countries criminalise same-sex acts.{' '}
            {deathConfirmed.length > 0
              ? `In ${deathConfirmed.length} the penalty is death.`
              : null}{' '}
            {deathPossible.length > 0
              ? `In ${deathPossible.length} more our source names the death penalty as possible but records no legal certainty; we list those as uncertain rather than as safe.`
              : null}{' '}
            Venues, events and organizations in these countries are hidden from signed-out visitors
            by design.
          </CoverageNote>
          <ul className="list-none p-0 m-0 grid gap-x-8 md:grid-cols-2">
            {criminalizing.map((c) => (
              <CountryLink key={c.id} country={c} showDeathRisk />
            ))}
          </ul>
        </div>
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
      id: 'help',
      label: 'If you need help',
      content: (
        <div className="flex flex-wrap gap-4">
          <LocalizedLink
            to="/support"
            className="border-2 border-foreground px-6 py-2 font-medium no-underline rounded-element"
          >
            Find support near you
          </LocalizedLink>
          <LocalizedLink
            to="/help"
            className="border-2 border-foreground px-6 py-2 font-medium no-underline rounded-element"
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
      sections={sections}
      loading={isLoading}
      error={(error as Error) ?? null}
      disableProgress
    />
  );
}
