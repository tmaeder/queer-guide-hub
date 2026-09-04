import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { DevelopmentRow } from '@/lib/rights/recognitionPerspective';

/**
 * Recognition is not something countries grow into.
 *
 * DELIBERATELY NOT A SCATTER PLOT, and the reason is measured. Recognition
 * really does correlate with development in this dataset — self-ID countries
 * average HDI 0.877 against 0.722, surgery-requiring ones 0.777 against 0.837
 * — so an HDI-against-rights scatter would draw a clean upward ramp and invite
 * exactly one conclusion: that poor countries have not got there YET, and that
 * wealth produces recognition. That reading is false in both directions and
 * this page would be asserting it by accident.
 *
 * The counter-examples carry the true point without stating the false one.
 * Five countries in the UN's top development band demand sterilisation before
 * they will change a document, and four below it grant recognition on a
 * person's own word — with the two lists OVERLAPPING on income per head
 * (Uruguay at $23,907 outranks Montenegro and Romania above it). A ramp cannot
 * say that; two short lists can.
 *
 * Monochrome, no chart, no `--destructive` — the figures are the argument.
 */

function Row({ row, trailing }: { row: DevelopmentRow; trailing: string }) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-border py-2 text-13">
      <span className="min-w-0">
        {row.slug ? (
          <LocalizedLink to={`/country/${row.slug}`}>{row.name}</LocalizedLink>
        ) : (
          row.name
        )}
      </span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{trailing}</span>
    </li>
  );
}

export function DevelopmentCounterpoint({
  highHdiRequiresSurgery,
  lowHdiHasSelfId,
}: {
  highHdiRequiresSurgery: DevelopmentRow[];
  lowHdiHasSelfId: DevelopmentRow[];
}) {
  const { t } = useTranslation();

  // Self-hiding on data, the TagDiagnosticCodes contract: nothing upstream
  // decides this section is relevant, the presence of counter-examples does.
  if (highHdiRequiresSurgery.length === 0 && lowHdiHasSelfId.length === 0) return null;

  const hdi = (row: DevelopmentRow) => (row.hdi == null ? '—' : row.hdi.toFixed(3));
  const gdp = (row: DevelopmentRow) =>
    row.gdpPerCapita == null ? '' : ` · $${row.gdpPerCapita.toLocaleString('en-US')}`;

  return (
    <div>
      <p className="mb-6 max-w-prose">
        {t(
          'rights.trans.development.body',
          'Recognition does track wealth in this data — the countries that allow self-determination are richer on average than those that do not. That is exactly why it is worth naming the exceptions rather than drawing the trend: a chart of income against rights would suggest that poorer countries simply have not got there yet, and that is not what the record shows.',
        )}
      </p>

      {highHdiRequiresSurgery.length > 0 ? (
        <div className="mb-8">
          <h3 className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
            {t(
              'rights.trans.development.richHeading',
              'Very high development, and still requires sterilisation',
            )}
          </h3>
          <p className="mb-4 max-w-prose text-13 text-muted-foreground">
            {t(
              'rights.trans.development.richNote',
              'Each of these sits in the UN’s “very high human development” band and will not change a gender marker until you have had surgery.',
            )}
          </p>
          <ul className="m-0 list-none p-0 sm:max-w-md">
            {highHdiRequiresSurgery.map((row) => (
              <Row key={row.id} row={row} trailing={`HDI ${hdi(row)}${gdp(row)}`} />
            ))}
          </ul>
        </div>
      ) : null}

      {lowHdiHasSelfId.length > 0 ? (
        <div>
          <h3 className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
            {t(
              'rights.trans.development.poorHeading',
              'Below that band, and recognises you on your own word',
            )}
          </h3>
          <p className="mb-4 max-w-prose text-13 text-muted-foreground">
            {/*
              NOT "at a fraction of the income above". Measured: Uruguay is
              $23,907 per head, ahead of Montenegro ($13,263) and Romania
              ($20,080) in the list above. The two lists OVERLAP on income,
              which is a stronger point than a contrast would have been — and
              the contrast would simply have been false.
            */}
            {t(
              'rights.trans.development.poorNote',
              'No medical or judicial gatekeeper. Income per head here overlaps with the list above rather than sitting below it — the two orderings do not line up at all.',
            )}
          </p>
          <ul className="m-0 list-none p-0 sm:max-w-md">
            {lowHdiHasSelfId.map((row) => (
              <Row key={row.id} row={row} trailing={`HDI ${hdi(row)}${gdp(row)}`} />
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-6 max-w-prose text-13 text-muted-foreground">
        {t(
          'rights.trans.development.caveat',
          'HDI is a country-level composite and says nothing about a trans person’s life inside that country. It is here only to break the assumption that recognition follows income — not as a measure of anything a traveller should weigh.',
        )}
      </p>
    </div>
  );
}

export default DevelopmentCounterpoint;
