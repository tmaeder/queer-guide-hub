import { useTranslation } from 'react-i18next';
import type { TmmReporting } from '@/lib/rights/tmmCoverage';

/**
 * Why the table below is not a danger ranking, in two figures a reader can
 * check against the table itself.
 *
 * Both are unfiltered — every country, no population floor, no denominator
 * choice. That is deliberate: the obvious version of this panel compares the
 * mean equality score of countries with documented cases against those
 * without, and it only works inside a population filter (66.2 vs 48.9 above a
 * million people; 66.1 vs 64.3 across all 250). See the header of
 * `tmmCoverage.ts` for the measurement. These two need no such help.
 *
 * No bars and no chart. Two numbers this size do not need a visual encoding,
 * and any encoding here would be a second thing to misread.
 */
export function TmmReportingPanel({ reporting }: { reporting: TmmReporting }) {
  const { t } = useTranslation();
  if (reporting.totalCases === 0) return null;

  return (
    <div className="mb-8">
      <ul className="m-0 flex list-none flex-col gap-6 p-0 sm:flex-row sm:gap-12">
        <li className="min-w-0">
          <span className="block font-display text-display tabular-nums leading-none">
            {reporting.pctCasesInNonCriminalising}%
          </span>
          <span className="mt-2 block max-w-prose text-13 text-muted-foreground">
            {t(
              'rights.trans.reporting.nonCriminalising',
              'of every case ever recorded is in a country that does NOT criminalise same-sex acts.',
            )}
          </span>
        </li>
        <li className="min-w-0">
          <span className="block font-display text-display tabular-nums leading-none">
            {reporting.criminalisingWithNothingRecorded}
            <span className="text-headline text-muted-foreground">
              /{reporting.criminalisingTotal}
            </span>
          </span>
          <span className="mt-2 block max-w-prose text-13 text-muted-foreground">
            {t(
              'rights.trans.reporting.criminalisingZero',
              'countries that criminalise same-sex acts have recorded nothing at all, across eighteen years of monitoring.',
            )}
          </span>
        </li>
      </ul>
      <p className="mt-6 max-w-prose">
        {t(
          'rights.trans.reporting.conclusion',
          'Read as a danger ranking, this table says the safest places for trans people are the ones that jail them. What it actually measures is where someone was in a position to record a death — which needs local media, police who classify the case correctly, and trans-led organisations that follow it up.',
        )}
      </p>
    </div>
  );
}

export default TmmReportingPanel;
