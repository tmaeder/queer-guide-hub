import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { ExploreMapFilters } from '@/hooks/useExploreMapData';

const HINT_KEY = 'qg_map_hint_v1';

export interface MapNoticeProps {
  /** Points currently in view. Drives both the first-run nudge and "empty". */
  count: number;
  /** Not mid-fetch. */
  ready: boolean;
  /**
   * At least one fetch has COMPLETED. Without this the empty state fires on a
   * cold load — before the first request goes out, `ready` is already true and
   * the count is still 0, so the map says "No spots here yet" about an area it
   * has not looked at. The component this replaced gated on `mapReady` and
   * `!isCounterStale` for the same reason; dropping them was a regression.
   */
  settled: boolean;
  /** Any point layer switched on. All-off is a different situation from empty
   *  and needs different advice — panning will not help. */
  hasPointLayers: boolean;
  filters: ExploreMapFilters;
  /** Ambient "you are here" string, when the map has just located the user. */
  locationHint?: string | null;
}

/**
 * The map's one ephemeral message slot.
 *
 * Precedence, highest first: no lines on > empty > first run > location. The
 * empty state is the fussiest of these to get right — it is the only one that
 * makes a CLAIM about the data ("there is nothing here"), so it has to wait
 * until the map has actually looked.
 *
 * There used to be three independent absolutely-positioned overlays —
 * `MapFirstRunHint` (top centre), `LocationHint` (bottom left) and
 * `MapEmptyState` (dead centre) — each with its own timers and z-index, none
 * aware of the others. On a first visit to an empty area all three could show
 * at once, saying three different things about the same map.
 *
 * Precedence, highest first:
 *   1. Empty  — a map with nothing on it must explain itself before anything else.
 *   2. First run — orientation, but only when there IS something to orient to.
 *   3. Location — ambient, lowest stakes.
 *
 * One at a time, one place, one style.
 */
export function MapNotice({
  count,
  ready,
  settled,
  hasPointLayers,
  filters,
  locationHint,
}: MapNoticeProps) {
  const { t } = useTranslation();
  const [firstRun, setFirstRun] = useState(false);
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current || !ready || count <= 0) return;
    try {
      if (localStorage.getItem(HINT_KEY)) return;
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      return; // storage blocked → don't nag on every load
    }
    triggered.current = true;
    // Both scheduled, never synchronous: a setState in an effect BODY triggers
    // a cascading render (react-hooks/set-state-in-effect).
    const show = setTimeout(() => setFirstRun(true), 0);
    const hide = setTimeout(() => setFirstRun(false), 7000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [ready, count]);

  const noLines = hasPointLayers === false;
  const empty = !noLines && ready && settled && count === 0;

  const emptyMessage = filters.openNow
    ? t('map.canvas.emptyOpenNow', {
        defaultValue: 'Nothing open right now in view — turn off Open now or try later.',
      })
    : filters.dateRange
      ? t('map.canvas.emptyTimeRange', {
          defaultValue: 'No events in this time range here — widen the dates or pan out.',
        })
      : filters.search
        ? t('map.canvas.emptySearch', {
            defaultValue: 'No matches for "{{query}}" here — clear search or pan out.',
            query: filters.search,
          })
        : t('map.canvas.emptyDefault', {
            defaultValue: 'No spots here yet — pan, zoom out, or put one on the map.',
          });

  let body: React.ReactNode = null;
  let dismiss: (() => void) | undefined;

  if (noLines) {
    body = (
      <span className="max-w-xs text-center">
        {t('map.canvas.noLines', {
          defaultValue: 'Every line is switched off — turn one on under Lines.',
        })}
      </span>
    );
  } else if (empty) {
    body = <span className="max-w-xs text-center">{emptyMessage}</span>;
  } else if (firstRun) {
    body = (
      <>
        <TransitIcon name="info-point" size={14} />
        <span>
          {t('map.firstRun.spotsInView', {
            defaultValue: '{{count}} queer spots in view',
            count,
          })}
        </span>
      </>
    );
    dismiss = () => setFirstRun(false);
  } else if (locationHint) {
    body = (
      <>
        <TransitIcon name="near-you" size={14} />
        <span>{locationHint}</span>
      </>
    );
  }

  if (!body) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 z-30 flex -translate-y-1/2 justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-2 border-[3px] border-foreground bg-background py-1.5 pl-4 pr-2 text-13 text-foreground"
      >
        {body}
        {dismiss && (
          <button
            type="button"
            aria-label={t('map.firstRun.dismiss', { defaultValue: 'Dismiss' })}
            onClick={dismiss}
            className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

export default MapNotice;
