import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  RECOGNITION_REGIMES,
  type RegimeId,
  type RecognitionWorld,
} from '@/lib/rights/recognitionPerspective';
import { REGIME_LABEL_FALLBACK } from './recognitionRegimeLabels';

/**
 * The recognition map's route-strip legend, mirroring `RightsMapLegend` on
 * /rights: one station per regime that has countries, each carrying its count,
 * clicking filters the map and clicking again clears.
 *
 * Counts come from the same `RecognitionWorld` the band and ledger read, so
 * the legend cannot report a different world from the figures beside it.
 *
 * Note the counts are COUNTRIES even when the band is showing people. That is
 * deliberate: the legend annotates the map, the map is a country choropleth,
 * and labelling its stations with population would invite reading polygon area
 * as population — the exact misreading the band exists to correct.
 */
export function RecognitionMapLegend({
  world,
  activeRegime,
  onActiveRegimeChange,
}: {
  world: RecognitionWorld;
  activeRegime: RegimeId | null;
  onActiveRegimeChange: (regime: RegimeId | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <ol
      // Scrolls, never wraps — seven stations wrap to four rows at 390px and
      // become the tallest block on the page. Same reasoning as RightsMapLegend.
      className="-mx-1 flex items-end gap-4 overflow-x-auto px-1 pb-1 scrollbar-thin"
      aria-label={t('rights.trans.map.legend', 'Country counts by recognition regime')}
    >
      {RECOGNITION_REGIMES.map((regime) => {
        const bucket = world.buckets.find((b) => b.regime.id === regime.id);
        if (!bucket || bucket.countries === 0) return null;
        const isActive = activeRegime === regime.id;
        const isHatched = regime.texture === 'hatch';
        return (
          <li key={regime.id} className="shrink-0">
            <button
              type="button"
              aria-pressed={isActive}
              onClick={() => onActiveRegimeChange(isActive ? null : regime.id)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-element px-2 py-1',
                isActive && 'bg-muted',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'inline-block h-4 w-4 shrink-0 rounded-badge border border-border-hairline',
                  // The legend owns the literal hatch swatch: a MapLibre
                  // fill-pattern needs a raster sprite that cannot be resolved
                  // through mapTokens at runtime, so on the canvas the
                  // unmeasured class carries a denser hairline instead.
                  isHatched && 'hatch-ink',
                )}
                style={
                  isHatched
                    ? undefined
                    : { backgroundColor: 'hsl(var(--foreground))', opacity: regime.weight }
                }
              />
              {/* `text-headline` is rank 4 — the display face. Same choice as
                  RightsMapLegend's counts. */}
              <span className="font-display text-headline tabular-nums">{bucket.countries}</span>
              <span className="text-13 text-muted-foreground">
                {t(`rights.trans.regime.${regime.key}.label`, REGIME_LABEL_FALLBACK[regime.key])}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export default RecognitionMapLegend;
