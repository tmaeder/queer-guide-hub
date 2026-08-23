import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { useAllCountriesTransRights } from '@/hooks/useIntentData';
import { TgeuSourceLine } from '@/components/rights/SourceLine';
import {
  readTransViolence,
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

/** Monochrome CSS bar. The house pattern from RightsLedger — no chart library. */
function Bar({ value, of }: { value: number; of: number }) {
  const pct = of > 0 ? Math.round((value / of) * 100) : 0;
  return (
    <span
      className="inline-block h-1 w-20 shrink-0 bg-muted align-middle"
      role="presentation"
      aria-hidden="true"
    >
      <span className="block h-full bg-foreground/60" style={{ width: `${pct}%` }} />
    </span>
  );
}

function LedgerRow({
  label,
  value,
  of,
  note,
}: {
  label: string;
  value: number;
  of: number;
  note?: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-border py-2">
      <span className="min-w-0">
        {label}
        {note ? <span className="block text-xs text-muted-foreground">{note}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <Bar value={value} of={of} />
        <span className="text-13 tabular-nums text-muted-foreground">
          {value} / {of}
        </span>
      </span>
    </li>
  );
}

export default function TransRights() {
  const { t } = useTranslation();
  const { data: countries, isLoading, error } = useAllCountriesTransRights();

  const rows = useMemo(() => countries ?? [], [countries]);

  const recognition = useMemo(
    () => summariseRecognition(rows as unknown as Record<string, unknown>[]),
    [rows],
  );

  /** Countries whose law demands surgery before it will change a document. */
  const surgeryCountries = useMemo(
    () =>
      rows
        .filter((c) => {
          const lgr = c.lgbti_gender_recognition as Record<string, unknown> | null;
          return typeof lgr?.requires_surgery === 'string' && /^yes$/i.test(lgr.requires_surgery);
        })
        .map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    [rows],
  );

  const violence = useMemo(
    () =>
      rows
        .map((c) => ({ country: c, record: readTransViolence(c.trans_violence_documented) }))
        .filter((e) => e.record.state === 'documented')
        .sort((a, b) => (b.record.total ?? 0) - (a.record.total ?? 0)),
    [rows],
  );

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
        <div className="max-w-prose">
          <p className="mb-4">
            {t(
              'rights.trans.body.recognition',
              'The main rights index counts each right as a single yes or no. Gender recognition does not fit that shape: a country can allow you to change your gender marker and still require surgery, a psychiatric diagnosis or a divorce first. Those are counted separately here.',
            )}
          </p>
          <ul className="list-none p-0 m-0 mb-4">
            <LedgerRow
              label={t('rights.trans.ledger.marker', 'Gender marker change is possible')}
              value={recognition.markerChangePossible}
              of={recognition.measured}
            />
            <LedgerRow
              label={t('rights.trans.ledger.selfId', 'Recognition by self-determination')}
              value={recognition.selfId}
              of={recognition.measured}
              note={t(
                'rights.trans.ledger.selfIdNote',
                'No medical or judicial gatekeeper required.',
              )}
            />
            <LedgerRow
              label={t('rights.trans.ledger.surgery', 'Requires surgery')}
              value={recognition.requiresSurgery}
              of={recognition.measured}
              note={t(
                'rights.trans.ledger.surgeryNote',
                'A sterilisation requirement. Counted as a harm, not a missing protection.',
              )}
            />
            <LedgerRow
              label={t('rights.trans.ledger.diagnosis', 'Requires a psychiatric diagnosis')}
              value={recognition.requiresDiagnosis}
              of={recognition.measured}
            />
          </ul>
          <p className="text-muted-foreground text-13">
            {t('rights.trans.body.measured', 'Counted against the')}{' '}
            <span className="tabular-nums">{recognition.measured}</span>{' '}
            {t(
              'rights.trans.body.measuredTail',
              'countries where a value is recorded, not all {{total}} we cover. The rest are blank in the source, which is not the same as a "no".',
              { total: recognition.total },
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
                <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
                  {surgeryCountries.map((c) => (
                    <li key={c.id} className="text-13">
                      {c.slug ? (
                        <LocalizedLink to={`/country/${c.slug}`}>{c.name}</LocalizedLink>
                      ) : (
                        c.name
                      )}
                    </li>
                  ))}
                </ul>
              </div>
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
          <div className="overflow-x-auto">
            <table className="w-full text-13">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 font-medium">
                    {t('rights.trans.table.country', 'Country')}
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    {t('rights.trans.table.since', 'Recorded since 2008')}
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    {t('rights.trans.table.latest', 'Most recent period')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {violence.map(({ country, record }) => (
                  <tr key={country.id} className="border-b border-border">
                    <td className="py-2">
                      {country.slug ? (
                        <LocalizedLink to={`/country/${country.slug}`}>
                          {country.name}
                        </LocalizedLink>
                      ) : (
                        country.name
                      )}
                    </td>
                    {/* No --destructive, no colour scale: see the file header. */}
                    <td className="py-2 text-right tabular-nums">{record.total}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {record.latestPeriod ? `${record.latestCases} · ${record.latestPeriod}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
