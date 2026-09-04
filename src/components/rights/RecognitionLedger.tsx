import { useTranslation } from 'react-i18next';
import { FilterChip } from '@/components/transit/FilterChip';
import { formatPeople, formatPeopleExact, formatShare } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The recognition ledger, counted two ways at once.
 *
 * The page's argument is that counting countries and counting people give
 * opposite answers, so both numbers are ALWAYS in the DOM and the toggle only
 * changes which bar is emphasised. It is a lens, not a filter: nothing is ever
 * hidden by it, and a reader who never touches it still sees every figure.
 *
 * Measured, and why the toggle is worth building at all:
 *   requires surgery      15 of 250 countries (6%)  ·  3.39bn people (41%)
 *   self-determination    22 of 250 countries (9%)  ·  528m people  (6.4%)
 * The two rows move in OPPOSITE directions, which is what makes this an honest
 * device rather than a way of making one number look big.
 *
 * Monochrome and animation-free — this page is crisis-adjacent. No track
 * colours, no `--destructive`: see the header of src/pages/rights/TransRights.tsx.
 */

export type LedgerUnit = 'countries' | 'people';

export interface RecognitionLedgerRow {
  id: string;
  label: string;
  note?: string;
  countries: number;
  ofCountries: number;
  people: number;
  ofPeople: number;
}

function Bar({ value, of, emphasised }: { value: number; of: number; emphasised: boolean }) {
  return (
    <span
      className="inline-block h-1 w-20 shrink-0 bg-muted align-middle"
      role="presentation"
      aria-hidden="true"
    >
      <span
        className={cn('block h-full', emphasised ? 'bg-foreground/85' : 'bg-foreground/30')}
        style={{ width: `${formatShare(value, of)}%` }}
      />
    </span>
  );
}

/**
 * One unit's line. The visible unit word is not decoration — emphasis alone
 * would make the two lines distinguishable only by tone, which fails on a
 * greyscale display and for anyone who cannot compare two ink weights.
 */
function UnitLine({
  unitLabel,
  display,
  exact,
  value,
  of,
  emphasised,
}: {
  unitLabel: string;
  display: string;
  exact: string;
  value: number;
  of: number;
  emphasised: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">
        {unitLabel}
      </span>
      <Bar value={value} of={of} emphasised={emphasised} />
      <span
        className={cn(
          'text-13 tabular-nums',
          emphasised ? 'font-bold text-foreground' : 'text-muted-foreground',
        )}
        title={exact}
      >
        {display}
      </span>
    </span>
  );
}

export function RecognitionLedger({
  rows,
  unit,
  onUnitChange,
}: {
  rows: RecognitionLedgerRow[];
  unit: LedgerUnit;
  onUnitChange: (unit: LedgerUnit) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const unitLabels: Record<LedgerUnit, string> = {
    countries: t('rights.trans.unit.countries', 'Countries'),
    people: t('rights.trans.unit.people', 'People'),
  };

  return (
    <div>
      <div
        role="group"
        aria-label={t('rights.trans.unit.groupLabel', 'Count by')}
        className="mb-4 flex items-center gap-2"
      >
        <span className="text-2xs uppercase tracking-wide text-muted-foreground">
          {t('rights.trans.unit.groupLabel', 'Count by')}
        </span>
        {(['countries', 'people'] as const).map((u) => (
          <FilterChip
            key={u}
            active={unit === u}
            label={unitLabels[u]}
            onClick={() => onUnitChange(u)}
          />
        ))}
      </div>

      <ul className="list-none p-0 m-0">
        {rows.map((row) => (
          <li key={row.id} className="border-b border-border py-2">
            <span className="block">{row.label}</span>
            {row.note ? (
              <span className="mb-2 block text-xs text-muted-foreground">{row.note}</span>
            ) : null}
            <span className="mt-1 flex flex-col gap-1">
              <UnitLine
                unitLabel={unitLabels.countries}
                display={`${row.countries} / ${row.ofCountries} · ${formatShare(row.countries, row.ofCountries)}%`}
                exact={`${row.countries} of ${row.ofCountries} countries`}
                value={row.countries}
                of={row.ofCountries}
                emphasised={unit === 'countries'}
              />
              <UnitLine
                unitLabel={unitLabels.people}
                display={`${formatPeople(row.people, locale)} / ${formatPeople(row.ofPeople, locale)} · ${formatShare(row.people, row.ofPeople)}%`}
                exact={`${formatPeopleExact(row.people, locale)} of ${formatPeopleExact(row.ofPeople, locale)} people`}
                value={row.people}
                of={row.ofPeople}
                emphasised={unit === 'people'}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
