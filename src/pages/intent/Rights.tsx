import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { useAllCountriesRights, useIntentNews, type RightsCountry } from '@/hooks/useIntentData';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import { hasAnyCriminalizationSignal, hasDeathPenalty } from '@/utils/equalityScore';
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

type Tier = 'protected' | 'mixed' | 'restricted';

function tierOf(c: RightsCountry): Tier {
  if (hasAnyCriminalizationSignal(c.lgbti_criminalization)) return 'restricted';
  const score = c.equality_score;
  if (score == null) return 'mixed';
  if (score >= 75) return 'protected';
  if (score >= 40) return 'mixed';
  return 'restricted';
}

function CountryLink({ country }: { country: RightsCountry }) {
  const label = country.slug ? (
    <LocalizedLink to={`/country/${country.slug}`} className="no-underline hover:underline">
      {country.name}
    </LocalizedLink>
  ) : (
    <span>{country.name}</span>
  );
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-border py-2">
      <span className="font-medium">{label}</span>
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
    const out: Record<Tier, RightsCountry[]> = { protected: [], mixed: [], restricted: [] };
    for (const c of countries ?? []) out[tierOf(c)].push(c);
    return out;
  }, [countries]);

  const criminalizing = useMemo(
    () => (countries ?? []).filter((c) => hasAnyCriminalizationSignal(c.lgbti_criminalization)),
    [countries],
  );
  const deathPenalty = useMemo(
    () => criminalizing.filter((c) => hasDeathPenalty(c.lgbti_criminalization)),
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
            {hasDeathPenalty(here.lgbti_criminalization)
              ? 'Same-sex acts can carry the death penalty here.'
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
      kicker: 'All 250 countries and territories',
      content: (
        <div>
          <CoverageNote>
            Every country and territory we list has a recorded criminalisation status
            ({countries?.length ?? 0} of {countries?.length ?? 0}).{' '}
            {(countries ?? []).filter((c) => c.equality_score == null).length} carry no equality
            score and are shown as “not scored” rather than given a default.
          </CoverageNote>
          <div className="grid gap-8 md:grid-cols-3">
            {(['protected', 'mixed', 'restricted'] as Tier[]).map((tier) => (
              <div key={tier}>
                <h3 className="font-display text-title mb-2 capitalize">{tier}</h3>
                <p className="text-13 text-muted-foreground mb-4">
                  {buckets[tier].length} countries
                </p>
                <ul className="list-none p-0 m-0">
                  {buckets[tier].slice(0, 12).map((c) => (
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
            {deathPenalty.length > 0
              ? `In ${deathPenalty.length} of them the penalty can be death.`
              : null}{' '}
            Venues, events and organizations in these countries are hidden from signed-out visitors
            by design.
          </CoverageNote>
          <ul className="list-none p-0 m-0 grid gap-x-8 md:grid-cols-2">
            {criminalizing.map((c) => (
              <CountryLink key={c.id} country={c} />
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
