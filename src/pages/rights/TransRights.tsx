import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import {
  RecognitionLedger,
  type LedgerUnit,
  type RecognitionLedgerRow,
} from '@/components/rights/RecognitionLedger';
import { HumanityBand } from '@/components/rights/HumanityBand';
import { RecognitionWorldMap } from '@/components/rights/RecognitionWorldMap';
import { RecognitionMapLegend } from '@/components/rights/RecognitionMapLegend';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { SelfIdTimeline } from '@/components/rights/SelfIdTimeline';
import { DevelopmentCounterpoint } from '@/components/rights/DevelopmentCounterpoint';
import { TmmCountryTable, type TmmRow } from '@/components/rights/TmmCountryTable';
import { TmmReportingPanel } from '@/components/rights/TmmReportingPanel';
import { latestPeriodOf, summariseTmmReporting } from '@/lib/rights/tmmCoverage';
import {
  developmentCounterexamples,
  selfIdTimeline,
  summariseRecognitionWorld,
  type RegimeId,
} from '@/lib/rights/recognitionPerspective';
import { formatPeople, formatShare } from '@/lib/format';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { useAllCountriesTransRights } from '@/hooks/useIntentData';
import { TgeuSourceLine } from '@/components/rights/SourceLine';
import {
  readTransViolence,
  requiresIt,
  summariseRecognition,
  TGEU_TMM_URL,
  TGEU_TRI_URL,
  TMM_REPORTING_CAVEAT,
} from '@/lib/rights/transSafety';
import { computeRightsProfile } from '../../../supabase/functions/_shared/rights/verdict.ts';
import type { SectionDef } from '@/components/entity/editorial';

/**
 * `/rights/trans` — the trans safety dimension.
 *
 * Every safety signal elsewhere on this site is derived from ONE fact:
 * `location_is_high_risk()` reads criminalisation of same-sex acts. For trans
 * people that misses most of what determines whether a border, a hospital or a
 * police station is survivable, and the rights engine says so itself — the list
 * in `blindspots` below is read live out of `NOT_COVERED.trans`.
 *
 * Three axes, side by side, NEVER summed:
 *   1. Recognition — ILGA, 250 countries. Already the `trans` LensVerdict.
 *   2. Legal depth — TGEU Trans Rights Index, 54 countries.
 *   3. Documented violence — TGEU Trans Murder Monitoring, 90 countries.
 *
 * Axis 3 is display-only and this file contains no code path that lets it reach
 * a verdict, a tier or a sort key on any other surface. That is not fastidious;
 * TMM counts rank countries almost inversely to legal risk, so a version of this
 * page that combined them would tell a trans traveller that Brazil is the most
 * dangerous country on earth and that Iran is safe.
 *
 * Animation-free and monochrome (crisis-adjacent). `--destructive` is banned on
 * every TMM figure: it is reserved for criminalisation, and colouring Brazil's
 * count with it IS the inversion.
 *
 * Static second segment, per the routing rule in src/routes.tsx.
 */

/**
 * Read out of the engine rather than restated, so this page cannot drift from
 * what the verdict actually declines to cover. An empty row is enough — the
 * `notCovered` list is constant per lens.
 */
const TRANS_BLIND_SPOTS = computeRightsProfile({}).trans.notCovered;

// The local `Bar` / `LedgerRow` pair moved to
// src/components/rights/RecognitionLedger.tsx when each row gained a second
// unit. They kept the RightsLedger house pattern — a monochrome CSS bar, no
// chart library — and so does their replacement.

export default function TransRights() {
  const { t, i18n } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { data: countries, isLoading, error } = useAllCountriesTransRights();

  /**
   * Countries or people. Default `countries`, deliberately: the reader arrives
   * in the familiar frame, and switching is what PRODUCES the surprise. Both
   * figures are rendered either way — the toggle changes emphasis, not what is
   * available.
   */
  const [unit, setUnit] = useState<LedgerUnit>('countries');

  /** Legend station filter for the map. Null shows every regime. */
  const [activeRegime, setActiveRegime] = useState<RegimeId | null>(null);

  const rows = useMemo(() => countries ?? [], [countries]);

  /**
   * Clicking a country opens its page. The map hands back an ISO_A2 rather
   * than a row, so the lookup lives here — the choropleth stays ignorant of
   * what a country is.
   */
  const handleMapSelect = useCallback(
    (iso: string) => {
      const match = rows.find((c) => (c.code ?? '').toUpperCase() === iso);
      if (match?.slug) navigate(`/country/${match.slug}`);
    },
    [rows, navigate],
  );

  const recognition = useMemo(
    () => summariseRecognition(rows as unknown as Record<string, unknown>[]),
    [rows],
  );

  const world = useMemo(() => summariseRecognitionWorld(rows), [rows]);
  const timeline = useMemo(() => selfIdTimeline(rows), [rows]);
  const counterpoint = useMemo(() => developmentCounterexamples(rows), [rows]);

  /**
   * Denominators are the WHOLE world — 250 countries, every person alive — not
   * the 244 rows that carry a recognition record. Dividing by `measured`
   * flatters every percentage on the page, and "no record" is a real answer
   * about our knowledge that belongs in the total rather than out of it. The
   * per-field measured count is still stated below the ledger.
   */
  const ledgerRows: RecognitionLedgerRow[] = useMemo(
    () => [
      {
        id: 'marker',
        label: t('rights.trans.ledger.marker', 'Gender marker change is possible'),
        countries: recognition.markerChangePossible,
        ofCountries: recognition.total,
        people: recognition.peopleMarkerChangePossible,
        ofPeople: recognition.totalPeople,
      },
      {
        id: 'self-id',
        label: t('rights.trans.ledger.selfId', 'Recognition by self-determination'),
        note: t('rights.trans.ledger.selfIdNote', 'No medical or judicial gatekeeper required.'),
        countries: recognition.selfId,
        ofCountries: recognition.total,
        people: recognition.peopleSelfId,
        ofPeople: recognition.totalPeople,
      },
      {
        id: 'surgery',
        label: t('rights.trans.ledger.surgery', 'Requires surgery'),
        note: t(
          'rights.trans.ledger.surgeryNote',
          'A sterilisation requirement. Counted as a harm, not a missing protection.',
        ),
        countries: recognition.requiresSurgery,
        ofCountries: recognition.total,
        people: recognition.peopleRequiresSurgery,
        ofPeople: recognition.totalPeople,
      },
      {
        id: 'diagnosis',
        label: t('rights.trans.ledger.diagnosis', 'Requires a psychiatric diagnosis'),
        countries: recognition.requiresDiagnosis,
        ofCountries: recognition.total,
        people: recognition.peopleRequiresDiagnosis,
        ofPeople: recognition.totalPeople,
      },
    ],
    [recognition, t],
  );

  /**
   * Countries whose law demands surgery before it will change a document.
   *
   * This tested `/^yes$/i` until 2026-09-01 and so was ALWAYS empty, which
   * meant the entire section below it was omitted from the page — see
   * ilgaVocabulary.ts. There are 15, and they hold 3.39bn people.
   */
  const surgeryCountries = useMemo(
    () =>
      rows
        .filter((c) => requiresIt((c.lgbti_gender_recognition ?? {}).requires_surgery))
        .map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          population: Number(c.population ?? 0),
        }))
        .sort((a, b) => b.population - a.population),
    [rows],
  );

  const violence = useMemo(
    () =>
      rows
        .map((c) => ({ country: c, record: readTransViolence(c.trans_violence_documented) }))
        .filter((e) => e.record.state === 'documented'),
    [rows],
  );

  /**
   * Deliberately NOT sorted here. The table sorts alphabetically by default
   * and offers the case ordering as an opt-in — a list of countries ordered by
   * killings reads as a danger ranking, and this one is close to its inverse.
   */
  const tmmRows: TmmRow[] = useMemo(
    () =>
      violence.map(({ country, record }) => ({
        id: country.id,
        name: country.name,
        slug: country.slug ?? null,
        record,
      })),
    [violence],
  );

  const latestPeriod = useMemo(() => latestPeriodOf(violence.map((v) => v.record)), [violence]);

  const reporting = useMemo(() => summariseTmmReporting(rows), [rows]);

  const violenceTotal = violence.reduce((sum, e) => sum + (e.record.total ?? 0), 0);
  const fetchedAt = violence[0]?.record.fetchedAt ?? null;

  useMeta({
    title: t('rights.trans.metaTitle', 'Trans rights and safety, country by country'),
    description: t(
      'rights.trans.metaDescription',
      'Legal gender recognition in every country, what it costs to change a document, and TGEU’s record of documented anti-trans violence — with what none of it can tell you.',
    ),
    canonicalPath: '/rights/trans',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'Trans legal recognition and documented violence by country',
      description:
        'Legal gender recognition requirements per country from ILGA World, alongside aggregate documented anti-trans homicide counts from TGEU Trans Murder Monitoring.',
      creator: { '@type': 'Organization', name: 'Queer Guide' },
      isAccessibleForFree: true,
    },
  });

  const sections: SectionDef[] = [
    // ---------------------------------------------------------------------
    // Axis 1 — the ledger /rights deliberately cannot draw.
    // ---------------------------------------------------------------------
    {
      id: 'recognition',
      label: t('rights.trans.section.recognition', 'Legal gender recognition'),
      kicker: t('rights.trans.kicker.recognition', 'What a document change costs'),
      content: (
        <div>
          <p className="mb-4 max-w-prose">
            {t(
              'rights.trans.body.recognition',
              'The main rights index counts each right as a single yes or no. Gender recognition does not fit that shape: a country can allow you to change your gender marker and still require surgery, a psychiatric diagnosis or a divorce first. Those are counted separately here.',
            )}
          </p>

          {/*
            The sentence the whole page turns on. The numbers are separate
            nodes rather than {{interpolations}} so a locale missing the key
            degrades to English text and never prints a raw {{pct}} to a
            reader — the SourceLine {{parent}} lesson.
          */}
          <p className="mb-6 max-w-prose font-medium">
            <span className="tabular-nums">{recognition.requiresSurgery}</span>{' '}
            {t(
              'rights.trans.body.headlineA',
              'countries will not change your gender marker unless you have been sterilised. That is',
            )}{' '}
            <span className="tabular-nums">
              {formatShare(recognition.requiresSurgery, recognition.total)}%
            </span>{' '}
            {t('rights.trans.body.headlineB', 'of the world’s countries and')}{' '}
            <span className="tabular-nums">
              {formatShare(recognition.peopleRequiresSurgery, recognition.totalPeople)}%
            </span>{' '}
            {t('rights.trans.body.headlineC', 'of the world’s people —')}{' '}
            <span className="tabular-nums">
              {formatPeople(recognition.peopleRequiresSurgery, i18n.language)}
            </span>{' '}
            {t('rights.trans.body.headlineD', 'of us.')}
          </p>

          {/*
            Map ABOVE the band, always, and never on its own. A choropleth is
            area-weighted: read alone it makes the sterilisation regime look
            like a speckle, when it is 41% of humanity. Area first, then
            population directly underneath, so neither reading stands
            unqualified. Both are drawn from the same `world` object.
          */}
          <div className="mb-4">
            <RecognitionWorldMap
              countries={rows}
              activeRegime={activeRegime}
              onCountrySelect={handleMapSelect}
            />
            <div className="mt-4">
              <RecognitionMapLegend
                world={world}
                activeRegime={activeRegime}
                onActiveRegimeChange={setActiveRegime}
              />
            </div>
            <CoverageNote>
              {t(
                'rights.trans.map.coverage',
                'Legal gender recognition from the ILGA World Database, re-imported nightly. Countries with nothing recorded are drawn as no data, never as permissive. A few territories have no boundary to draw at this scale and cannot appear on the map at all, so its counts run slightly below the figures beneath it. The map is sized by land area — the band below is sized by people, which is the reading this page is about.',
              )}
            </CoverageNote>
          </div>

          <div className="mb-6">
            <HumanityBand world={world} unit={unit} />
          </div>

          <RecognitionLedger rows={ledgerRows} unit={unit} onUnitChange={setUnit} />

          <p className="mt-4 max-w-prose text-13 text-muted-foreground">
            {t(
              'rights.trans.body.denominator',
              'Every figure here divides by the whole world — all {{total}} countries, everyone alive — never only by the countries where a value happens to be recorded. A blank in the source is shown as its own block rather than dropped, because leaving it out of the denominator would quietly inflate every percentage on this page.',
              { total: recognition.total },
            )}
          </p>
          <p className="mt-2 max-w-prose text-13 text-muted-foreground">
            {t('rights.trans.body.measured', 'A recognition record exists for')}{' '}
            <span className="tabular-nums">{recognition.measured}</span>{' '}
            {t(
              'rights.trans.body.measuredTail',
              'of them. The rest are blank in the source, which is not the same as a "no".',
            )}
          </p>
        </div>
      ),
      action: (
        <LocalizedLink
          to="/rights#gender-recognition"
          className="text-13 no-underline hover:underline"
        >
          {t('rights.trans.toRights', 'All 18 rights')}
        </LocalizedLink>
      ),
    },

    // ---------------------------------------------------------------------
    // The list a trans traveller can act on. Legal facts, no counts.
    // ---------------------------------------------------------------------
    ...(surgeryCountries.length > 0
      ? [
          {
            id: 'surgery',
            label: t('rights.trans.section.surgery', 'Where the law demands surgery'),
            content: (
              <div>
                <p className="mb-4 max-w-prose">
                  {t(
                    'rights.trans.body.surgery',
                    'In these countries the law will not change your gender marker unless you have had surgery. Where a country records this, the rights verdict for trans people is capped at “few or no protections” however much anti-discrimination law it also has.',
                  )}
                </p>
                {/*
                  Ordered by population, with the figure beside each name. A
                  flat alphabetical list of 15 reads as 15 equally-sized
                  places; two of these countries are most of the total, and
                  the caveat below says so rather than letting the list imply
                  otherwise.
                */}
                <ul className="m-0 flex list-none flex-col gap-1 p-0 sm:max-w-md">
                  {surgeryCountries.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-baseline justify-between gap-4 border-b border-border py-1 text-13"
                    >
                      <span>
                        {c.slug ? (
                          <LocalizedLink to={`/country/${c.slug}`}>{c.name}</LocalizedLink>
                        ) : (
                          c.name
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatPeople(c.population, i18n.language)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 max-w-prose text-13 text-muted-foreground">
                  {t(
                    'rights.trans.body.surgeryConcentration',
                    'The two largest account for most of that total, so this is a list of where the law falls hardest on the most people — not a ranking of 15 equally bad places.',
                  )}
                </p>
              </div>
            ),
          } satisfies SectionDef,
        ]
      : []),

    // ---------------------------------------------------------------------
    // Still axis 1, read along time rather than across countries. Self-hiding
    // on data, so a source that stops recording start years empties the
    // section instead of drawing a line from two points.
    // ---------------------------------------------------------------------
    ...(timeline.length > 1
      ? [
          {
            id: 'timeline',
            label: t('rights.trans.section.timeline', 'When it arrived'),
            kicker: t('rights.trans.kicker.timeline', 'Self-determination since 2012'),
            content: (
              <div>
                <p className="mb-6 max-w-prose">
                  {t(
                    'rights.trans.body.timeline',
                    'Recognition on a person’s own word is recent everywhere it exists. Argentina was the first country to grant it, and most of the rest followed within the last decade — which is also why it is fragile: nothing here has been settled long enough to be taken for granted.',
                  )}
                </p>
                <SelfIdTimeline years={timeline} />
              </div>
            ),
          } satisfies SectionDef,
        ]
      : []),

    // ---------------------------------------------------------------------
    // The correlation exists; the exceptions are what is worth showing. See
    // the component header for why this is not a scatter plot.
    // ---------------------------------------------------------------------
    ...(counterpoint.highHdiRequiresSurgery.length > 0 || counterpoint.lowHdiHasSelfId.length > 0
      ? [
          {
            id: 'development',
            label: t('rights.trans.section.development', 'Not a question of wealth'),
            content: (
              <DevelopmentCounterpoint
                highHdiRequiresSurgery={counterpoint.highHdiRequiresSurgery}
                lowHdiHasSelfId={counterpoint.lowHdiHasSelfId}
              />
            ),
          } satisfies SectionDef,
        ]
      : []),

    // ---------------------------------------------------------------------
    // Axis 2 — TGEU Trans Rights Index. We deliberately keep NO local copy of
    // its scores and send the reader to TGEU instead.
    //
    // Two reasons, and the second is the load-bearing one:
    //
    //  1. Licence. The Trans Rights Map is CC BY-NC-SA 4.0. This site takes
    //     payments and affiliate commission, so reproducing their scored
    //     dataset here is the use the NonCommercial clause is written about.
    //     A link is unambiguously fine; a copy is not.
    //
    //  2. Freshness, which outlives the licence question. The index is
    //     re-scored every year on IDAHOBIT and 2026 was the first year in
    //     thirteen that it went BACKWARDS. A transcribed snapshot silently
    //     becomes wrong the day they republish, and a stale trans-rights score
    //     is worse than no score: it tells someone a border is passable on
    //     last year's law. `safety_notes_composer` is this codebase's own
    //     precedent — a derived field that outlived its input served the wrong
    //     country's law to 86 cities for two months.
    //
    // So this section is always rendered and always current, because it is a
    // pointer rather than a copy.
    // ---------------------------------------------------------------------
    {
      id: 'index',
      label: t('rights.trans.section.index', 'Trans Rights Index'),
      kicker: t('rights.trans.kicker.index', 'Europe and Central Asia only'),
      content: (
        <div>
          <p className="mb-4 max-w-prose">
            {t(
              'rights.trans.body.index',
              'TGEU scores 54 countries in Europe and Central Asia across 32 areas of trans-specific law, in six categories: legal gender recognition, asylum, hate crime and hate speech, non-discrimination, health, and family. It is the most detailed reading of trans-specific law anywhere, and it covers only those 54 countries — the rest of the world is outside its scope, which is not the same as scoring zero.',
            )}
          </p>
          <p className="mb-4 max-w-prose">
            {t(
              'rights.trans.body.indexNoCopy',
              'We do not reproduce their scores here. They are re-scored every year and a copy would go quietly out of date, which for a trans-rights score means telling you a border is passable on last year’s law. Read them from TGEU, where they are current.',
            )}
          </p>
          <p className="mb-4 max-w-prose text-13 text-muted-foreground">
            {t(
              'rights.trans.body.indexCaveat',
              'TGEU notes these scores read legal text only. They take no account of how a law is applied at a particular border, clinic or police station.',
            )}
          </p>
          <TgeuSourceLine
            href={TGEU_TRI_URL}
            label={t('rights.trans.triSource', 'Trans Rights Index & Map')}
            updatedAt={null}
          />
        </div>
      ),
    } satisfies SectionDef,

    // ---------------------------------------------------------------------
    // Axis 3 — documented violence. Caveat FIRST, uncoloured, display only.
    // ---------------------------------------------------------------------
    {
      id: 'documented',
      label: t('rights.trans.section.documented', 'Documented violence'),
      kicker: t('rights.trans.kicker.documented', 'Trans Murder Monitoring'),
      content: (
        <div>
          {/*
            Section-leading, not a footnote. A reader who takes only the table
            away must not take away a ranking of danger — see the header note.
          */}
          <p className="mb-4 max-w-prose font-medium">
            {t('rights.trans.caveat', TMM_REPORTING_CAVEAT)}
          </p>
          <p className="mb-4 max-w-prose text-muted-foreground">
            {t(
              'rights.trans.body.documented',
              'Since 2008 TGEU has recorded {{total}} killings of trans and gender-diverse people across {{countries}} countries. Cases are counted in TDoR periods, which run October to September. TGEU publishes no names, photographs or causes of death, and we store none.',
              { total: violenceTotal, countries: violence.length },
            )}
          </p>
          {/*
            The argument comes BEFORE the table, so a reader cannot reach the
            country list without passing the reason it is not a ranking.
          */}
          <TmmReportingPanel reporting={reporting} />

          <TmmCountryTable rows={tmmRows} latestPeriod={latestPeriod} />
          <p className="mt-4 max-w-prose text-13 text-muted-foreground">
            {t(
              'rights.trans.body.absent',
              'Countries not listed have no case recorded in this dataset. That is not a finding about their safety — it usually means no one was in a position to count.',
            )}
          </p>
          <TgeuSourceLine
            href={TGEU_TMM_URL}
            label={t('rights.trans.tmmSource', 'Trans Murder Monitoring')}
            updatedAt={fetchedAt}
            className="mt-2"
          />
        </div>
      ),
    },

    // ---------------------------------------------------------------------
    // What none of the three axes can answer.
    // ---------------------------------------------------------------------
    {
      id: 'blindspots',
      label: t('rights.trans.section.blindspots', 'What this cannot tell you'),
      content: (
        <div className="max-w-prose">
          <p className="mb-4">
            {t(
              'rights.trans.body.blindspots',
              'Our legal source records statutes. These are the things it does not record at all, and they are often the ones that decide how a journey actually goes:',
            )}
          </p>
          <ul className="mb-4 flex list-disc flex-col gap-2 pl-4">
            {TRANS_BLIND_SPOTS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mb-4">
            {t(
              'rights.trans.body.actsNotIdentity',
              'Where same-sex acts are criminalised we mark the trans verdict as criminalised too. That is an inference we are stating openly rather than hiding: the statutes cover acts, not gender identity, but in practice they are enforced against trans women through public-order and impersonation law.',
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              'rights.trans.body.notAboutYou',
              'And none of it knows anything about you. Your citizenship, your documents and whether they match how you present all change what happens at a border, and we hold none of that.',
            )}
          </p>
        </div>
      ),
    },

    {
      id: 'sources',
      label: t('rights.trans.section.sources', 'Sources'),
      content: (
        <div className="max-w-prose">
          <p className="mb-4">
            {t(
              'rights.trans.body.sources',
              'Legal gender recognition and anti-discrimination law come from the ILGA World Database, re-imported nightly. The documented-violence counts and the Trans Rights Index are TGEU’s work; we hold aggregate figures only and every number here links back to them.',
            )}
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            <li>
              <a
                href={TGEU_TMM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-4"
              >
                {t('rights.trans.tmmSource', 'Trans Murder Monitoring')}
              </a>
            </li>
            <li>
              <a
                href={TGEU_TRI_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-4"
              >
                {t('rights.trans.triSource', 'Trans Rights Index & Map')}
              </a>
            </li>
            <li>
              <LocalizedLink to="/rights/sources">
                {t('rights.trans.toSources', 'How we handle the legal data')}
              </LocalizedLink>
            </li>
          </ul>
        </div>
      ),
      action: (
        <LocalizedLink to="/rights" className="text-13 no-underline hover:underline">
          {t('rights.trans.backToRights', 'Back to rights')}
        </LocalizedLink>
      ),
    },
  ];

  return (
    <IntentPageLayout
      breadcrumbLabel={t('rights.trans.breadcrumb', 'Trans')}
      breadcrumbHref="/rights/trans"
      eyebrow={t('rights.trans.eyebrow', 'Rights')}
      title={t('rights.trans.title', 'Trans rights and safety')}
      lede={t(
        'rights.trans.lede',
        'Whether a country will change your documents, what it makes you give up first, and what TGEU has been able to record about violence against trans people. Three separate things — we keep them separate.',
      )}
      sections={sections}
      loading={isLoading}
      error={(error as Error) ?? null}
      disableProgress
    />
  );
}
