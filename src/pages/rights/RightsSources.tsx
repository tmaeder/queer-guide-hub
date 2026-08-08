import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { useAllCountriesRights } from '@/hooks/useIntentData';
import { RIGHT_TOPICS } from '@/lib/rights/rightsCatalog';
import type { SectionDef } from '@/components/entity/editorial';

/**
 * `/rights/sources` — where the legal data comes from, and what it cannot tell
 * you.
 *
 * `/rights` rendered an equality score a hundred times over with no source, no
 * date and no definition, while `/country/:slug` cited ILGA on every card. This
 * is the page the citation now points at.
 *
 * It is deliberately blunt about the score's construction. A number that opens
 * at 50 and adds points cannot distinguish "measured and mediocre" from "never
 * measured", and a reader deciding whether somewhere is safe deserves to know
 * that before they weigh it.
 *
 * Static second segment, per the routing rule in src/routes.tsx.
 */
export default function RightsSources() {
  const { t } = useTranslation();
  const { data: countries, isLoading, error } = useAllCountriesRights();

  const total = countries?.length ?? 0;
  const withStatus = (countries ?? []).filter(
    (c) => (c.lgbti_criminalization as Record<string, unknown> | null)?.legal != null,
  ).length;
  const scored = (countries ?? []).filter((c) => c.equality_score != null).length;

  useMeta({
    title: t('rights.sources.metaTitle', 'Where our LGBTQ+ rights data comes from'),
    description: t(
      'rights.sources.metaDescription',
      'The sources, refresh cadence, coverage and known limits behind the legal status we publish for every country and territory.',
    ),
    canonicalPath: '/rights/sources',
  });

  const sections: SectionDef[] = [
    {
      id: 'source',
      label: t('rights.sources.section.source', 'The source'),
      kicker: t('rights.sources.kicker.source', 'ILGA World'),
      content: (
        <div className="max-w-prose">
          <p className="mb-4">
            {t(
              'rights.sources.body.source',
              'Every legal status on this site — criminalisation, partnership recognition, anti-discrimination protection, gender recognition, conversion therapy and intersex bodily integrity — comes from the ILGA World Database, the reference dataset maintained by the International Lesbian, Gay, Bisexual, Trans and Intersex Association.',
            )}
          </p>
          <p className="mb-4">
            {t(
              'rights.sources.body.refresh',
              'We re-import it nightly. Where a country page shows an "Updated" date, that is the date ILGA last revised that record, not the date we fetched it.',
            )}
          </p>
          <a
            href="https://database.ilga.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-4"
          >
            {t('rights.sources.body.link', 'ILGA World Database')}
          </a>
        </div>
      ),
    },
    {
      id: 'coverage',
      label: t('rights.sources.section.coverage', 'Coverage'),
      kicker: t('rights.sources.kicker.coverage', 'What we actually hold'),
      content: (
        <div className="max-w-prose">
          <ul className="list-none p-0 m-0 mb-4">
            <li className="flex items-baseline justify-between gap-4 border-b border-border py-2">
              <span>
                {t('rights.sources.coverage.status', 'Countries with a recorded legal status')}
              </span>
              <span className="text-13 text-muted-foreground tabular-nums">
                {withStatus} / {total}
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-4 border-b border-border py-2">
              <span>{t('rights.sources.coverage.scored', 'Countries with an equality score')}</span>
              <span className="text-13 text-muted-foreground tabular-nums">
                {scored} / {total}
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-4 border-b border-border py-2">
              <span>{t('rights.sources.coverage.rights', 'Distinct rights tracked per country')}</span>
              <span className="text-13 text-muted-foreground tabular-nums">
                {RIGHT_TOPICS.length}
              </span>
            </li>
          </ul>
          <p className="text-muted-foreground">
            {t(
              'rights.sources.body.unscored',
              'The unscored rows are uninhabited or near-uninhabited territories with no ILGA entry. We list them as "not scored" rather than giving them a default, because a default would read as a measurement.',
            )}
          </p>
        </div>
      ),
    },
    {
      id: 'score',
      label: t('rights.sources.section.score', 'The equality score'),
      kicker: t('rights.sources.kicker.score', 'How it is built, and what it hides'),
      content: (
        <div className="max-w-prose">
          <p className="mb-4">
            {t(
              'rights.sources.body.scoreHow',
              'The score runs 0–100. It starts at 50 and moves up or down as each recorded right is added: decriminalisation and marriage weigh heaviest, then anti-discrimination protections, hate-crime law, adoption, legal gender recognition and a conversion-therapy ban.',
            )}
          </p>
          <p className="mb-4 font-medium">
            {t(
              'rights.sources.body.scoreLimit',
              'Because it opens at 50 and adds from there, a country we hold almost nothing about lands mid-scale rather than reading as unknown. A middling score can mean middling rights or thin data, and the number cannot tell you which.',
            )}
          </p>
          <p className="mb-4">
            {t(
              'rights.sources.body.scoreLens',
              'It is also a single number for very different lives. Protections are recorded separately for sexual orientation, gender identity, gender expression and sex characteristics, and those four rarely move together — a country can protect sexual orientation thoroughly and gender identity not at all. Read the per-right breakdown on a country page rather than the score alone.',
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              'rights.sources.body.scoreNotSafety',
              'The score describes law on paper. It is not a safety rating, and it says nothing about enforcement, policing or how welcome you will be made to feel.',
            )}
          </p>
        </div>
      ),
    },
    {
      id: 'limits',
      label: t('rights.sources.section.limits', 'What this data cannot tell you'),
      content: (
        <div className="max-w-prose">
          <ul className="list-disc pl-4 mb-4 flex flex-col gap-2">
            <li>
              {t(
                'rights.sources.limits.national',
                'It is national. Where rights vary by state or province — the United States, Indonesia, Nigeria, Mexico and others — a single national figure averages that away.',
              )}
            </li>
            <li>
              {t(
                'rights.sources.limits.enforcement',
                'It records statutes, not enforcement. A law that is rarely applied and a law applied constantly look identical here.',
              )}
            </li>
            <li>
              {t(
                'rights.sources.limits.trans',
                'Several facts that matter most to trans travellers are not in this dataset at all: bathroom and facility access, how identity documents are treated at borders, and access to gender-affirming healthcare.',
              )}
            </li>
            <li>
              {t(
                'rights.sources.limits.personal',
                'It knows nothing about you. Your citizenship, residency, gender marker and relationship status all change what applies, and we hold none of them.',
              )}
            </li>
          </ul>
          <p className="text-muted-foreground">
            {t(
              'rights.sources.limits.corrections',
              'If something here is wrong, tell us — corrections to the underlying record should also go to ILGA, who maintain it.',
            )}
          </p>
        </div>
      ),
      action: (
        <LocalizedLink to="/rights" className="text-13 no-underline hover:underline">
          {t('rights.sources.backToRights', 'Back to rights')}
        </LocalizedLink>
      ),
    },
  ];

  return (
    <IntentPageLayout
      breadcrumbLabel={t('rights.sources.breadcrumb', 'Sources')}
      breadcrumbHref="/rights/sources"
      eyebrow={t('rights.sources.eyebrow', 'Method')}
      title={t('rights.sources.title', 'Where this data comes from')}
      lede={t(
        'rights.sources.lede',
        'We publish the legal status of LGBTQ+ people in every country and territory we cover. This page says who recorded it, how often we refresh it, how much of it we actually hold, and the questions it cannot answer.',
      )}
      sections={sections}
      loading={isLoading}
      error={(error as Error) ?? null}
      disableProgress
    />
  );
}
