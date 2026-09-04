import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPeople, formatPeopleExact, formatShare } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { LedgerUnit } from './RecognitionLedger';
import type { RecognitionWorld } from '@/lib/rights/recognitionPerspective';
import { REGIME_LABEL_FALLBACK, REGIME_NOTE_FALLBACK } from './recognitionRegimeLabels';

/**
 * Every person alive, as one band, segmented by what the law where they live
 * does with a gender marker.
 *
 * The choropleth beside this is area-weighted, which under-represents exactly
 * the point being made: the countries that demand sterilisation are not many,
 * they are large. This is the population view of the same classification —
 * literally the same `RecognitionWorld`, so the two can never disagree.
 *
 * Four redundant cues, because seven steps of one ink is past what tone alone
 * resolves (see chartPalette.ts) and because colour may never be the only
 * encoding (WCAG 1.4.1):
 *   1. ink weight, declared per regime rather than derived from an index
 *   2. an in-band percentage numeral wherever the segment is wide enough
 *   3. a hatch TEXTURE on the two "no usable answer" regimes, so the unknowns
 *      differ from the measured ones by shape and not merely by tone
 *   4. the ledger below, which is the full text equivalent
 *
 * Animation-free: no transition, no duration. Selection swaps instantly. The
 * readout has a fixed minimum height so hovering the band never reflows the
 * page under the reader's cursor.
 */

/** Below this width an inline numeral is unreadable; the readout carries it. */
const MIN_LABEL_PCT = 6;

export function HumanityBand({ world, unit }: { world: RecognitionWorld; unit: LedgerUnit }) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);

  const total = unit === 'people' ? world.totalPeople : world.totalCountries;
  if (total <= 0) return null;

  const valueOf = (b: RecognitionWorld['buckets'][number]) =>
    unit === 'people' ? b.people : b.countries;

  const label = (key: string) =>
    t(`rights.trans.regime.${key}.label`, REGIME_LABEL_FALLBACK[key] ?? key);
  const note = (key: string) =>
    t(`rights.trans.regime.${key}.note`, REGIME_NOTE_FALLBACK[key] ?? '');

  const display = (n: number) => (unit === 'people' ? formatPeople(n, i18n.language) : String(n));
  const exact = (n: number) =>
    unit === 'people' ? formatPeopleExact(n, i18n.language) : String(n);

  const unitWord =
    unit === 'people'
      ? t('rights.trans.unit.peopleLower', 'people')
      : t('rights.trans.unit.countriesLower', 'countries');

  const active = world.buckets.find((b) => b.regime.id === selected) ?? null;

  return (
    <figure className="m-0">
      <div
        role="group"
        aria-label={t(
          'rights.trans.band.label',
          'Share of the world by legal gender recognition regime',
        )}
        className="flex h-12 w-full gap-px"
      >
        {world.buckets.map((bucket) => {
          const value = valueOf(bucket);
          if (value <= 0) return null;
          const pct = formatShare(value, total);
          const isHatched = bucket.regime.texture === 'hatch';
          return (
            <button
              key={bucket.regime.id}
              type="button"
              aria-pressed={selected === bucket.regime.id}
              aria-label={`${label(bucket.regime.key)}: ${exact(value)} ${unitWord}, ${pct}%`}
              onMouseEnter={() => setSelected(bucket.regime.id)}
              onFocus={() => setSelected(bucket.regime.id)}
              onClick={() => setSelected(bucket.regime.id)}
              style={{ width: `${(value / total) * 100}%` }}
              className={cn(
                'relative h-full min-w-[2px] overflow-hidden',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              )}
            >
              <span
                aria-hidden="true"
                className={cn('absolute inset-0', isHatched ? 'hatch-ink' : 'bg-foreground')}
                style={isHatched ? undefined : { opacity: bucket.regime.weight }}
              />
              {pct >= MIN_LABEL_PCT ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'relative text-2xs font-bold tabular-nums',
                    // Ink plate under pale type only where the fill is dark
                    // enough to carry it; the pale segments keep ink type.
                    bucket.regime.weight >= 0.5 && !isHatched
                      ? 'text-background'
                      : 'text-foreground',
                  )}
                >
                  {pct}%
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Fixed height: the band must not reflow the page as the cursor moves. */}
      <figcaption className="mt-2 min-h-[3rem] text-13">
        {active ? (
          <>
            <span className="font-bold">{label(active.regime.key)}</span>
            {' — '}
            <span className="tabular-nums">{display(valueOf(active))}</span> {unitWord} (
            <span className="tabular-nums">{formatShare(valueOf(active), total)}%</span>).{' '}
            <span className="text-muted-foreground">{note(active.regime.key)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">
            {t(
              'rights.trans.band.caption',
              'Every country in the world, sized by how many people live there. Nothing is left out of the total — the two hatched blocks are countries where the law is unclear or unrecorded, which is not the same as a "no".',
            )}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
