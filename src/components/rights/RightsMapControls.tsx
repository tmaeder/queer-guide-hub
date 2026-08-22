import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  RIGHT_SECTION_ORDER,
  RIGHT_SECTION_LABEL,
  topicsInSection,
  type RightTopic,
} from '@/lib/rights/rightsCatalog';
import type { RightsLens } from '@/lib/rights/rightsClassify';
import {
  SECTION_TRACK,
  MAP_CLASS_ORDER,
  MAP_CLASS_LABEL,
  MAP_CLASS_INK,
  type MapClass,
} from '@/lib/rights/rightsMapModel';
import { TRACK_BG, TRACK_TEXT } from '@/components/transit/routeBulletMap';

/**
 * The two control surfaces for the /rights world map: which line/station
 * (right) is painted, which lens (whose protection) narrows a
 * protection-matrix reading, plus the route-strip legend that reads the
 * result back as counts.
 *
 * Crisis-adjacent page (CLAUDE.md § Design — Crisis & safety pages are
 * animation-free): no `transition-*` / `animate-*` / `duration-*` anywhere
 * in this file, matching HelpHotlines. Track colours are wayfinding, never
 * risk — only the line selector's active station takes a track fill, and it
 * always carries `border-track-ring` (WCAG 1.4.11, fill-vs-ring). The legend
 * is the one place `--destructive` may appear, reserved for the two
 * criminal-exposure-with-death classes.
 */

const LENS_OPTIONS: readonly { value: RightsLens; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'so', label: 'Sexual orientation' },
  { value: 'gi', label: 'Gender identity' },
  { value: 'ge', label: 'Gender expression' },
  { value: 'sc', label: 'Sex characteristics' },
];

interface RightsMapControlsProps {
  topic: RightTopic;
  onTopicChange: (t: RightTopic) => void;
  lens: RightsLens;
  onLensChange: (l: RightsLens) => void;
  counts: Record<MapClass, number>;
  activeClass: MapClass | null;
  onActiveClassChange: (c: MapClass | null) => void;
}

export function RightsMapControls({
  topic,
  onTopicChange,
  lens,
  onLensChange,
  counts,
  activeClass,
  onActiveClassChange,
}: RightsMapControlsProps) {
  const { t } = useTranslation();
  const lensDisabled = topic.kind !== 'protection-matrix';

  return (
    <div className="space-y-6">
      {/* (a) Line selector — 5 lines, 18 stations. */}
      <div className="space-y-4" role="group" aria-label={t('rights.map.lineSelector', 'Rights')}>
        {RIGHT_SECTION_ORDER.map((section) => {
          const track = SECTION_TRACK[section];
          return (
            <div key={section} className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-track-ring',
                    TRACK_BG[track],
                  )}
                />
                <span className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t(`country.rights.section.${section}`, RIGHT_SECTION_LABEL[section])}
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {topicsInSection(section).map((stationTopic) => {
                  const isActive = stationTopic.slug === topic.slug;
                  return (
                    <button
                      key={stationTopic.slug}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => onTopicChange(stationTopic)}
                      className={cn(
                        'shrink-0 whitespace-nowrap rounded-element px-4 py-1.5 text-13 font-bold',
                        isActive
                          ? cn('border border-track-ring', TRACK_BG[track], TRACK_TEXT[track])
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {t(`country.rights.${stationTopic.labelKey}`, stationTopic.labelDefault)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* (b) Lens selector — "Who the law protects". */}
      <div className="space-y-2">
        <span className="block text-2xs font-bold uppercase tracking-wide text-muted-foreground">
          {t('rights.map.lens.heading', 'Who the law protects')}
        </span>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={t('rights.map.lens.heading', 'Who the law protects')}
        >
          {LENS_OPTIONS.map((option) => {
            const isActive = option.value === lens;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                disabled={lensDisabled}
                onClick={() => onLensChange(option.value)}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-element px-4 py-1.5 text-13 font-bold',
                  lensDisabled && 'opacity-50',
                  isActive ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
                )}
              >
                {t(`rights.map.lens.${option.value}`, option.label)}
              </button>
            );
          })}
        </div>
        {lensDisabled ? (
          <p className="text-13 text-muted-foreground">
            {t(
              'rights.map.lens.disabledNote',
              'This law is recorded once for everyone — no per-group reading exists.',
            )}
          </p>
        ) : null}
      </div>

      {/* (c) Route-strip legend. */}
      <ol
        className="flex flex-wrap items-end gap-6"
        aria-label={t('rights.map.legend', 'Country counts by status')}
      >
        {MAP_CLASS_ORDER.filter((cls) => counts[cls] > 0).map((cls) => {
          const isActive = activeClass === cls;
          return (
            <li key={cls}>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => onActiveClassChange(isActive ? null : cls)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-element px-2 py-1',
                  isActive && 'bg-muted',
                )}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-4 shrink-0 rounded-badge border border-border-hairline"
                  style={legendSwatchStyle(cls)}
                />
                <span className="font-display text-title tabular-nums">{counts[cls]}</span>
                <span className="text-13 text-muted-foreground">
                  {t(`rights.map.class.${cls}`, MAP_CLASS_LABEL[cls])}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Swatch fill: ink at `MAP_CLASS_INK[cls]` for every class except the two
 * criminal-exposure-with-death classes (`--destructive`) and `nodata` (a
 * diagonal hairline hatch — no-data is never a fill, per the design doc's
 * §1 rule that a gap must never look like safety). `repeating-linear-
 * gradient` in a `style` prop is CSS, not a Tailwind `bg-gradient-to-*`
 * class, so it does not trip the JSX gradient ban.
 */
function legendSwatchStyle(cls: MapClass): CSSProperties {
  if (cls === 'nodata') {
    return {
      backgroundColor: 'hsl(var(--card))',
      backgroundImage:
        'repeating-linear-gradient(45deg, hsl(var(--foreground) / 0.35) 0, hsl(var(--foreground) / 0.35) 1px, transparent 1px, transparent 6px)',
    };
  }
  if (cls === 'deathPossible') {
    return {
      backgroundColor: 'hsl(var(--destructive))',
      backgroundImage:
        'repeating-linear-gradient(45deg, hsl(var(--destructive-foreground) / 0.45) 0, hsl(var(--destructive-foreground) / 0.45) 1px, transparent 1px, transparent 6px)',
    };
  }
  if (cls === 'death') {
    return { backgroundColor: 'hsl(var(--destructive))' };
  }
  return { backgroundColor: `hsl(var(--foreground) / ${MAP_CLASS_INK[cls]})` };
}

export default RightsMapControls;
