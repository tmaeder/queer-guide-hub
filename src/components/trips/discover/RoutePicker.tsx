import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { VIBE_IDS, type PaceId, type Station, type VibeId } from '@/lib/lines/generateLine';
import { availability, isOfferable, seasonWindows, type SeasonId } from '@/lib/lines/seasons';
import { PickerLine, type PickerOption } from './PickerLine';
// Shared with the trip templates: one definition of what a vibe counts.
import { VIBE_MIN, vibeCount } from '@/lib/lines/vibes';

/**
 * Three lines: what you want, when, and how fast.
 *
 * Vibe and pace are pink (they filter and shape). Season is pink too — one
 * accent per context, and the route below is the only blue thing on the page.
 *
 * The season line is the one that has to tell the truth about thin data. Its
 * counts are computed from the pool already in memory (`event_months` rides
 * along on every row), so this costs no query, and a window that cannot carry a
 * three-stop line is shown with its real numbers and marked unselectable rather
 * than hidden. Hiding it would let the reader infer that queer life stops for
 * the winter; showing "16 stations, none close enough to line up" says the true
 * thing, which is that our listings are thin there.
 */

interface RoutePickerProps {
  pool: Station[];
  vibe: VibeId | null;
  season: SeasonId | null;
  pace: PaceId;
  now: Date;
  onVibe: (v: VibeId | null) => void;
  onSeason: (s: SeasonId | null) => void;
  onPace: (p: PaceId) => void;
}

const PACE_IDS: PaceId[] = ['slow', 'steady', 'sprint'];

export function RoutePicker({
  pool,
  vibe,
  season,
  pace,
  now,
  onVibe,
  onSeason,
  onPace,
}: RoutePickerProps) {
  const { t } = useTranslation();

  const windows = useMemo(() => seasonWindows(now), [now]);

  const vibeOptions: PickerOption[] = useMemo(
    () =>
      VIBE_IDS.map((id) => {
        const count = pool.filter((s) => vibeCount(s, id) >= VIBE_MIN[id]).length;
        return {
          id,
          label: t(`trips.discover.picker.vibe.${id}`, VIBE_FALLBACK[id]),
          short: t(`trips.discover.picker.vibe.${id}`, VIBE_FALLBACK[id]),
          meta: t('trips.discover.picker.stationCount', '{{count}} stations', { count }),
          disabled: count < 3,
          disabledReason: t('trips.discover.picker.tooFew', 'only {{count}} stations', { count }),
        };
      }),
    [pool, t],
  );

  const seasonOptions: PickerOption[] = useMemo(
    () =>
      windows.map((w) => {
        const a = availability(pool, w);
        const offerable = isOfferable(a);
        return {
          id: w.id,
          label: t(`trips.discover.picker.season.${w.id}`, SEASON_FALLBACK[w.id]),
          short: t(`trips.discover.picker.season.${w.id}`, SEASON_FALLBACK[w.id]),
          meta: t('trips.discover.picker.stationCount', '{{count}} stations', { count: a.cities }),
          disabled: !offerable,
          disabledReason: t(
            'trips.discover.picker.thin',
            '{{count}} stations, none close enough to line up',
            { count: a.cities },
          ),
        };
      }),
    [pool, windows, t],
  );

  const paceOptions: PickerOption[] = useMemo(
    () =>
      PACE_IDS.map((id) => ({
        id,
        label: t(`trips.discover.picker.pace.${id}`, PACE_FALLBACK[id]),
        short: t(`trips.discover.picker.pace.${id}`, PACE_FALLBACK[id]),
        meta: t('trips.discover.picker.stopCount', '{{count}} stops', {
          count: id === 'slow' ? 3 : id === 'steady' ? 4 : 5,
        }),
      })),
    [t],
  );

  return (
    <div className="space-y-6">
      <PickerLine
        options={vibeOptions}
        activeId={vibe}
        onSelect={(id) => onVibe(id as VibeId | null)}
        label={t('trips.discover.picker.vibeGroup', 'What you are after')}
      />
      <PickerLine
        options={seasonOptions}
        activeId={season}
        onSelect={(id) => onSeason(id as SeasonId | null)}
        label={t('trips.discover.picker.seasonGroup', 'When')}
      />
      <PickerLine
        options={paceOptions}
        activeId={pace}
        // Pace has no null state — a line always has a length. Re-clicking the
        // active stop is a no-op here rather than a clear.
        onSelect={(id) => id && onPace(id as PaceId)}
        label={t('trips.discover.picker.paceGroup', 'How fast')}
      />
    </div>
  );
}

/** Fallbacks live beside the keys so a missing translation degrades to English. */
const VIBE_FALLBACK: Record<VibeId, string> = {
  nightlife: 'Out late',
  sauna: 'Steam',
  slow: 'Slow mornings',
  community: 'Community',
  outdoors: 'Outdoors',
};

const SEASON_FALLBACK: Record<SeasonId, string> = {
  now: 'Soon',
  autumn: 'Autumn',
  winter: 'Winter',
  pride: 'Pride season',
};

const PACE_FALLBACK: Record<PaceId, string> = {
  slow: 'Take it slow',
  steady: 'Steady',
  sprint: 'Cover ground',
};
