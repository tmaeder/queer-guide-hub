import { useTranslation } from 'react-i18next';
import { CopyableSnippet } from '@/components/ui/copyable-snippet';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { useAllCountriesRights } from '@/hooks/useIntentData';
import { EditorialDetailLayout, type SectionDef } from '@/components/entity/editorial';
import { PageHero } from '@/components/discovery';
import {
  EQUALITY_TIER_CUTOFFS,
  EQUALITY_TIER_I18N_KEY,
  EQUALITY_TIER_LABEL,
  type EqualityTier,
} from '@/utils/equalityScore';
import {
  EQUALITY_SCORE_METHOD,
  EQUALITY_SCORE_RAW_MAX,
  EQUALITY_SCORE_RAW_MIN,
  EQUALITY_SCORE_START,
} from '@/lib/rights/equalityScoreMethod';

const CANONICAL = 'https://queer.guide/tags/rights-by-country/methodology';

function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : `−${Math.abs(points)}`;
}

/**
 * `/tags/rights-by-country/methodology` — the equality score, line by line.
 *
 * `/sources` explains where the data comes from and why the score is not a
 * safety rating. This page is the part a researcher or journalist needs before
 * citing a number: every weight, the range, the tier cutoffs, the cases where
 * the formula reads ILGA differently than a reader might expect, and a citation.
 *
 * The weights come from EQUALITY_SCORE_METHOD, which a unit test checks against
 * the nightly formula, so this page cannot quietly disagree with the score.
 */
export default function RightsMethodology() {
  const { t } = useTranslation();
  const { data: countries, isLoading, error } = useAllCountriesRights();
  const atCeiling = (countries ?? []).filter((c) => c.equality_score === 100).length;
  const scored = (countries ?? []).filter((c) => c.equality_score != null).length;

  useMeta({
    title: t('rights.methodology.metaTitle', 'How the LGBTQ+ equality score is calculated'),
    description: t(
      'rights.methodology.metaDescription',
      'Every weight in the Queer Guide equality score, the 0–100 range, the tier cutoffs, its known limits, and how to cite it.',
    ),
    canonicalPath: '/tags/rights-by-country/methodology',
  });

  const tierLabel = (tier: EqualityTier) =>
    t(`trips.safety.scoreLabel.${EQUALITY_TIER_I18N_KEY[tier]}`, EQUALITY_TIER_LABEL[tier]);

  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const citeTitle = 'LGBTQ+ equality score: methodology';
  const cites = [
    {
      label: t('rights.methodology.cite.apa', 'APA'),
      text: `Queer Guide. (${year}). ${citeTitle}. Retrieved ${today}, from ${CANONICAL}`,
    },
    {
      label: t('rights.methodology.cite.plain', 'Plain text'),
      text: `Queer Guide, "${citeTitle}", ${CANONICAL} (accessed ${today}). Legal data: ILGA World Database.`,
    },
    {
      label: 'BibTeX',
      text: `@misc{queerguide_equality_score,\n  author = {{Queer Guide}},\n  title = {${citeTitle}},\n  year = {${year}},\n  url = {${CANONICAL}},\n  note = {Accessed ${today}. Legal data: ILGA World Database}\n}`,
    },
  ];

  const sections: SectionDef[] = [
    {
      id: 'formula',
      label: t('rights.methodology.section.formula', 'The formula'),
      kicker: t('rights.methodology.kicker.formula', 'Every weight'),
      content: (
        <div className="flex flex-col gap-6">
          <p className="max-w-prose text-body-lg">
            {t('rights.methodology.body.formula', {
              defaultValue:
                'Each country starts at {{start}}. Points are added or subtracted for each fact ILGA records, then the total is held between 0 and 100. Some rows are alternatives: a country gets marriage or civil union, not both, and at most one penalty deduction.',
              start: EQUALITY_SCORE_START,
            })}
          </p>
          {EQUALITY_SCORE_METHOD.map((group) => (
            <div key={group.id} className="overflow-x-auto rounded-container bg-card shadow-soft">
              <table className="w-full min-w-[36rem] border-collapse text-15">
                <caption className="bg-foreground px-6 py-4 text-left text-2xs font-bold uppercase tracking-label text-background">
                  {t(`rights.methodology.group.${group.id}`, group.label)}
                </caption>
                <thead>
                  <tr className="text-left text-2xs uppercase tracking-label text-muted-foreground">
                    <th scope="col" className="px-6 py-2 font-bold">
                      {t('rights.methodology.col.fact', 'Recorded fact')}
                    </th>
                    <th scope="col" className="px-6 py-2 text-right font-bold">
                      {t('rights.methodology.col.points', 'Points')}
                    </th>
                    <th scope="col" className="px-6 py-2 font-bold">
                      {t('rights.methodology.col.field', 'ILGA field')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.id} className="border-t border-border-hairline">
                      <td className="px-6 py-2">
                        {t(`rights.methodology.row.${row.id}`, row.label)}
                      </td>
                      <td className="px-6 py-2 text-right font-bold tabular-nums">
                        {formatPoints(row.points)}
                      </td>
                      <td className="px-6 py-2">
                        <code className="text-13">{row.field}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'range',
      label: t('rights.methodology.section.range', 'Range and tiers'),
      content: (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="max-w-prose text-body-lg">
            <p className="mb-4">
              {t('rights.methodology.body.range', {
                defaultValue:
                  'Before the 0–100 limit, the lowest possible total is {{min}} and the highest is {{max}}. The top is reached with points to spare, so 100 means "at least 100", not "every right recorded".',
                min: EQUALITY_SCORE_RAW_MIN,
                max: EQUALITY_SCORE_RAW_MAX,
              })}
            </p>
            {scored > 0 && (
              <p className="font-bold">
                {t('rights.methodology.body.ceiling', {
                  defaultValue:
                    '{{atCeiling}} of {{scored}} scored countries and territories currently sit at exactly 100. The score cannot rank them against each other.',
                  atCeiling,
                  scored,
                })}
              </p>
            )}
          </div>
          <div className="overflow-hidden rounded-container bg-card shadow-soft">
            <table className="w-full border-collapse text-15">
              <caption className="bg-foreground px-6 py-4 text-left text-2xs font-bold uppercase tracking-label text-background">
                {t('rights.methodology.tiers', 'Tier cutoffs')}
              </caption>
              <tbody>
                {EQUALITY_TIER_CUTOFFS.map(({ tier, min }, i) => {
                  const max = i === 0 ? 100 : EQUALITY_TIER_CUTOFFS[i - 1].min - 1;
                  return (
                    <tr key={tier} className="border-t border-border-hairline first:border-t-0">
                      <td className="px-6 py-2 font-bold">{tierLabel(tier)}</td>
                      <td className="px-6 py-2 text-right tabular-nums">
                        {min}–{max}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border-hairline">
                  <td className="px-6 py-2 font-bold">{tierLabel('unknown')}</td>
                  <td className="px-6 py-2 text-right">
                    {t('rights.methodology.tierUnknown', 'No ILGA record')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: 'limits',
      label: t('rights.methodology.section.limits', 'Known limits'),
      content: (
        <ul className="m-0 grid max-w-prose list-disc gap-4 pl-6 text-body-lg">
          <li>
            {t(
              'rights.methodology.limits.start',
              'Starting at 50 means a country with almost nothing recorded lands mid-scale. A middling score can mean middling rights or thin data.',
            )}
          </li>
          <li>
            {t(
              'rights.methodology.limits.penaltyText',
              "The penalty deduction reads ILGA's description of the penalty, not its separate death-penalty field. Where ILGA describes the penalty as imprisonment but also records the death penalty in part of the country (Nigeria, under Sharia law in northern states), the score deducts for life imprisonment, not death.",
            )}
          </li>
          <li>
            {t(
              'rights.methodology.limits.uneven',
              'Sexual orientation counts for more than gender identity in every protection area (2 points against 1), and hate-crime and incitement laws count only for sexual orientation. The score therefore says more about lesbian, gay and bisexual people than about trans people. ',
            )}{' '}
            <LocalizedLink to="/tags/rights-by-country/trans">
              {t('rights.methodology.limits.transLink', 'Trans rights by country')}
            </LocalizedLink>
          </li>
          <li>
            {t(
              'rights.methodology.limits.law',
              'It is national, it records statutes rather than enforcement, and it is not a safety rating.',
            )}{' '}
            <LocalizedLink to="/tags/rights-by-country/sources">
              {t('rights.methodology.limits.sourcesLink', 'More on the data and its limits')}
            </LocalizedLink>
          </li>
        </ul>
      ),
    },
    {
      id: 'cite',
      label: t('rights.methodology.section.cite', 'Cite this'),
      content: (
        <div className="flex flex-col gap-4">
          <p className="max-w-prose text-body-lg">
            {t(
              'rights.methodology.body.cite',
              'Cite the score as Queer Guide and the legal facts behind it as the ILGA World Database. Scores are recomputed nightly, so include the date you accessed them.',
            )}
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {cites.map((c) => (
              <CopyableSnippet
                key={c.label}
                label={c.label}
                text={c.text}
                copyLabel={t('rights.methodology.cite.copy', 'Copy')}
                copiedLabel={t('rights.methodology.cite.copied', 'Copied')}
                failedMessage={t(
                  'rights.methodology.cite.copyFailed',
                  'Could not copy automatically. The citation is selected; copy it with your keyboard.',
                )}
              />
            ))}
          </div>
        </div>
      ),
    },
  ];

  return (
    <EditorialDetailLayout
      loading={isLoading}
      error={(error as Error) ?? null}
      entityType="intent"
      disableProgress
      sectionNavVariant="subway"
      breadcrumbs={[
        { label: t('header.intents.knowledge.label', 'Knowledge'), href: '/tags' },
        {
          label: t('header.nav.rightsByCountry', 'Rights by country'),
          href: '/tags/rights-by-country',
        },
        {
          label: t('rights.methodology.breadcrumb', 'Methodology'),
          href: '/tags/rights-by-country/methodology',
        },
      ]}
      header={
        <PageHero
          bare
          size="md"
          eyebrow={t('rights.methodology.heroLine', 'Rights line · Methodology')}
          title={t('rights.methodology.title', 'How the equality score is calculated')}
          lede={t(
            'rights.methodology.lede',
            'The equality score is a 0–100 number we compute every night from the ILGA World Database. This page lists every weight, the range, the tier cutoffs and the cases the score gets wrong.',
          )}
        />
      }
      sections={sections}
    />
  );
}
