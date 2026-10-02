import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { useAllCountriesRights } from '@/hooks/useIntentData';
import { RIGHT_TOPICS } from '@/lib/rights/rightsCatalog';
import { EditorialDetailLayout, type SectionDef } from '@/components/entity/editorial';
import { PageHero } from '@/components/discovery';

interface MethodStop {
  id: string;
  label: ReactNode;
  code: string;
}

function MethodRoute({
  stops,
  ariaLabel,
  lineLabel,
  stationCountLabel,
}: {
  stops: MethodStop[];
  ariaLabel: string;
  lineLabel: ReactNode;
  stationCountLabel: ReactNode;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="relative overflow-hidden rounded-container bg-surface-container p-6 shadow-soft md:p-8"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <span className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
          {lineLabel}
        </span>
        <span className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
          {stationCountLabel}
        </span>
      </div>
      <ol className="relative m-0 grid list-none gap-4 p-0 before:absolute before:bottom-8 before:left-4 before:top-8 before:w-2 before:rounded-full before:bg-track-blue md:grid-cols-4 md:gap-6 md:before:bottom-auto md:before:left-[12.5%] md:before:right-[12.5%] md:before:top-4 md:before:h-2 md:before:w-auto">
        {stops.map((stop) => (
          <li key={stop.id} className="relative z-1">
            <a
              href={`#${stop.id}`}
              className="group grid grid-cols-[2.25rem_1fr] items-center gap-4 rounded-element p-1 no-underline md:grid-cols-1 md:justify-items-center md:gap-4 md:text-center"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full border-[4px] border-foreground bg-background text-2xs font-bold transition-transform group-hover:scale-110 group-focus-visible:scale-110">
                {stop.code}
              </span>
              <span className="text-13 font-bold text-foreground group-hover:underline group-focus-visible:underline">
                {stop.label}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function StationPanel({
  code,
  label,
  children,
  tone = 'blue',
}: {
  code: string;
  label: ReactNode;
  children: ReactNode;
  tone?: 'blue' | 'ink';
}) {
  const ink = tone === 'ink';
  return (
    <div
      className={
        ink
          ? 'overflow-hidden rounded-container bg-foreground text-background shadow-soft-lg'
          : 'overflow-hidden rounded-container bg-[hsl(var(--track-blue)/0.12)] shadow-soft'
      }
    >
      <div
        className={`flex items-center gap-4 px-6 py-4 md:px-8 ${ink ? 'border-b border-background/20' : 'border-b border-foreground/10'}`}
      >
        <span
          className={`grid h-9 w-9 place-items-center rounded-full border-[3px] text-2xs font-bold ${ink ? 'border-background bg-track-blue text-foreground' : 'border-foreground bg-track-blue'}`}
        >
          {code}
        </span>
        <span className="text-2xs font-bold uppercase tracking-label">{label}</span>
      </div>
      <div className="p-6 md:p-8">{children}</div>
    </div>
  );
}

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
        <StationPanel
          code="S1"
          label={t('rights.sources.station.source', 'Source station · ILGA World')}
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
            <div className="max-w-prose text-body-lg">
              <p className="mb-4">
                {t(
                  'rights.sources.body.source',
                  'Every legal status on this site — criminalisation, partnership recognition, anti-discrimination protection, gender recognition, conversion therapy and intersex bodily integrity — comes from the ILGA World Database, the reference dataset maintained by the International Lesbian, Gay, Bisexual, Trans and Intersex Association.',
                )}
              </p>
              <p>
                {t(
                  'rights.sources.body.refresh',
                  'We re-import it nightly. Where a country page shows an "Updated" date, that is the date ILGA last revised that record, not the date we fetched it.',
                )}
              </p>
            </div>
            <aside className="self-start rounded-element bg-background p-6 shadow-soft">
              <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
                {t('rights.sources.source.primary', 'Primary dataset')}
              </p>
              <p className="mt-2 font-display text-headline">
                {t('rights.sources.body.link', 'ILGA World Database')}
              </p>
              <p className="mt-2 text-13 text-muted-foreground">
                {t('rights.sources.source.cadence', 'Imported every night')}
              </p>
              <a
                href="https://database.ilga.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex rounded-element bg-foreground px-4 py-4 text-13 font-bold no-underline transition-transform hover:-translate-y-0.5 hover:shadow-[5px_5px_0_hsl(var(--track-blue))]"
                style={{ color: 'hsl(var(--background))' }}
              >
                {t('rights.sources.source.open', 'Open ILGA World')} ↗
              </a>
            </aside>
          </div>
        </StationPanel>
      ),
    },
    {
      id: 'coverage',
      label: t('rights.sources.section.coverage', 'Coverage'),
      kicker: t('rights.sources.kicker.coverage', 'What we actually hold'),
      content: (
        <div className="overflow-hidden rounded-container bg-card shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-foreground px-6 py-4 text-background md:px-8">
            <span className="flex items-center gap-4 text-2xs font-bold uppercase tracking-label">
              <span className="grid h-9 w-9 place-items-center rounded-full border-[3px] border-background bg-track-blue text-foreground">
                S2
              </span>
              {t('rights.sources.coverage.board', 'Coverage board')}
            </span>
            <span className="text-2xs font-bold uppercase tracking-label opacity-70">
              {t('rights.sources.coverage.live', 'Current import')}
            </span>
          </div>
          <ul className="m-0 list-none p-0">
            {[
              {
                code: '01',
                label: t(
                  'rights.sources.coverage.status',
                  'Countries with a recorded legal status',
                ),
                value: `${withStatus} / ${total}`,
              },
              {
                code: '02',
                label: t('rights.sources.coverage.scored', 'Countries with an equality score'),
                value: `${scored} / ${total}`,
              },
              {
                code: '03',
                label: t('rights.sources.coverage.rights', 'Distinct rights tracked per country'),
                value: String(RIGHT_TOPICS.length),
              },
            ].map((row) => (
              <li
                key={row.code}
                className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-b border-border-hairline px-6 py-6 last:border-b-0 md:grid-cols-[3rem_1fr_auto] md:px-8"
              >
                <span className="font-display text-title text-muted-foreground">{row.code}</span>
                <span className="text-15 font-bold md:text-title">{row.label}</span>
                <span className="font-display text-headline tabular-nums md:text-display">
                  {row.value}
                </span>
              </li>
            ))}
          </ul>
          <p className="bg-surface-container px-6 py-6 text-13 leading-relaxed text-muted-foreground md:px-8">
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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
          <StationPanel
            code="S3"
            label={t('rights.sources.station.score', 'Score station · 0–100')}
          >
            <div
              className="mb-8 rounded-element bg-background p-6 md:p-8"
              aria-label={t(
                'rights.sources.score.scaleLabel',
                'Equality score scale from 0 to 100, starting at 50',
              )}
            >
              <div className="flex items-end justify-between font-display text-headline tabular-nums">
                <span>0</span>
                <span className="text-display">50</span>
                <span>100</span>
              </div>
              <div className="relative mt-4 h-10" aria-hidden="true">
                <span className="absolute left-0 right-0 top-4 h-2 rounded-full bg-track-blue" />
                <span className="absolute left-1/2 top-0 grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full border-[4px] border-foreground bg-track-yellow text-2xs font-bold text-foreground">
                  50
                </span>
              </div>
              <p className="mt-4 text-center text-2xs font-bold uppercase tracking-label text-muted-foreground">
                {t('rights.sources.score.start', 'Every record starts here')}
              </p>
            </div>
            <div className="max-w-prose">
              <p className="mb-4">
                {t(
                  'rights.sources.body.scoreHow',
                  'The score runs 0–100. It starts at 50 and moves up or down as each recorded right is added: decriminalisation and marriage weigh heaviest, then anti-discrimination protections, hate-crime law, adoption, legal gender recognition and a conversion-therapy ban.',
                )}
              </p>
              <p className="font-bold">
                {t(
                  'rights.sources.body.scoreLimit',
                  'Because it opens at 50 and adds from there, a country we hold almost nothing about lands mid-scale rather than reading as unknown. A middling score can mean middling rights or thin data, and the number cannot tell you which.',
                )}
              </p>
            </div>
          </StationPanel>
          <div className="flex flex-col overflow-hidden rounded-container bg-foreground p-6 text-background shadow-soft-lg md:p-8">
            <span className="self-start bg-track-yellow px-4 py-2 text-2xs font-bold uppercase tracking-label text-foreground">
              {t('rights.sources.score.caution', 'Read before using')}
            </span>
            <p className="mt-6 font-display text-headline md:text-display">
              {t('rights.sources.score.notSafetyTitle', 'This is not a safety rating.')}
            </p>
            <p className="mt-6 text-15 leading-relaxed opacity-80">
              {t(
                'rights.sources.body.scoreNotSafety',
                'The score describes law on paper. It is not a safety rating, and it says nothing about enforcement, policing or how welcome you will be made to feel.',
              )}
            </p>
            <p className="mt-6 border-t border-background/20 pt-6 text-15 leading-relaxed opacity-80">
              {t(
                'rights.sources.body.scoreLens',
                'It is also a single number for very different lives. Protections are recorded separately for sexual orientation, gender identity, gender expression and sex characteristics, and those four rarely move together — a country can protect sexual orientation thoroughly and gender identity not at all. Read the per-right breakdown on a country page rather than the score alone.',
              )}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'limits',
      label: t('rights.sources.section.limits', 'What this data cannot tell you'),
      content: (
        <StationPanel
          code="S4"
          label={t('rights.sources.station.limits', 'Terminal · Off the map')}
          tone="ink"
        >
          <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
            {[
              t(
                'rights.sources.limits.national',
                'It is national. Where rights vary by state or province — the United States, Indonesia, Nigeria, Mexico and others — a single national figure averages that away.',
              ),
              t(
                'rights.sources.limits.enforcement',
                'It records statutes, not enforcement. A law that is rarely applied and a law applied constantly look identical here.',
              ),
              t(
                'rights.sources.limits.trans',
                'Several facts that matter most to trans travellers are not in this dataset at all: bathroom and facility access, how identity documents are treated at borders, and access to gender-affirming healthcare.',
              ),
              t(
                'rights.sources.limits.personal',
                'It knows nothing about you. Your citizenship, residency, gender marker and relationship status all change what applies, and we hold none of them.',
              ),
            ].map((limit, index) => (
              <li
                key={index}
                className="rounded-element bg-background/10 p-6 text-15 leading-relaxed"
              >
                <span className="mb-4 block font-display text-title text-track-blue">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {limit}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-6 border-t border-background/20 pt-6">
            <p className="max-w-prose text-13 leading-relaxed opacity-70">
              {t(
                'rights.sources.limits.corrections',
                'If something here is wrong, tell us — corrections to the underlying record should also go to ILGA, who maintain it.',
              )}
            </p>
            <LocalizedLink
              to="/rights"
              className="rounded-element bg-background px-4 py-4 text-13 font-bold no-underline transition-transform hover:-translate-y-0.5 hover:shadow-[5px_5px_0_hsl(var(--track-blue))]"
              style={{ color: 'hsl(var(--foreground))' }}
            >
              {t('rights.sources.backToRights', 'Back to rights')} →
            </LocalizedLink>
          </div>
        </StationPanel>
      ),
    },
  ];

  const methodStops: MethodStop[] = sections.map((section, index) => ({
    id: section.id,
    label: section.label,
    code: `S${index + 1}`,
  }));

  return (
    <EditorialDetailLayout
      loading={isLoading}
      error={(error as Error) ?? null}
      entityType="intent"
      disableProgress
      sectionNavVariant="subway"
      breadcrumbs={[
        {
          label: t('rights.sources.breadcrumb', 'Sources'),
          href: '/rights/sources',
        },
      ]}
      header={
        <PageHero
          bare
          size="md"
          eyebrow={t('rights.sources.heroLine', 'Rights line · Method')}
          title={t('rights.sources.title', 'Where this data comes from')}
          lede={t(
            'rights.sources.lede',
            'We publish the legal status of LGBTQ+ people in every country and territory we cover. This page says who recorded it, how often we refresh it, how much of it we actually hold, and the questions it cannot answer.',
          )}
          className="overflow-visible"
        >
          <MethodRoute
            stops={methodStops}
            ariaLabel={t('rights.sources.route.aria', 'Method route')}
            lineLabel={t('rights.sources.heroLine', 'Rights line · Method')}
            stationCountLabel={t('rights.sources.route.stationCount', '4 stations')}
          />
        </PageHero>
      }
      sections={sections}
    />
  );
}
