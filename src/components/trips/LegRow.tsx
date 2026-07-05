import { Footprints, TramFront, Car } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTripMutations } from '@/hooks/useTrips';
import {
  formatLegDistance,
  formatLegDuration,
  type TransportMode,
  type TripLeg,
} from './tripLegs';

const MODE_ICONS: Record<TransportMode, typeof Footprints> = {
  walk: Footprints,
  transit: TramFront,
  drive: Car,
};

const MODE_CYCLE: TransportMode[] = ['walk', 'transit', 'drive'];

interface Props {
  leg: TripLeg;
  /** Viewer role: mode is display-only, no cycling. */
  readOnly?: boolean;
}

/**
 * Compact between-cards row showing the estimated hop to the next place.
 * Clicking the mode cycles walk → transit → drive and persists the override
 * on the destination place (`arrive_mode`).
 */
export function LegRow({ leg, readOnly = false }: Props) {
  const { t } = useTranslation();
  const { updatePlace } = useTripMutations();
  const Icon = MODE_ICONS[leg.mode];

  const cycleMode = () => {
    const next = MODE_CYCLE[(MODE_CYCLE.indexOf(leg.mode) + 1) % MODE_CYCLE.length];
    updatePlace.mutate({ id: leg.toId, arrive_mode: next });
  };

  const duration = formatLegDuration(leg.durationMin);

  return (
    <div
      className="flex items-center gap-2 pl-12 py-0.5 mb-1.5 text-xs2 text-muted-foreground"
      data-testid="leg-row"
    >
      <span className="w-px h-3 bg-border ml-1.5" aria-hidden />
      {readOnly ? (
        <span className="inline-flex items-center gap-1 px-1 py-0.5">
          <Icon className="w-3 h-3" aria-hidden />
          <span>
            {formatLegDistance(leg.distanceKm)} · {duration}
          </span>
        </span>
      ) : (
        <button
          type="button"
          onClick={cycleMode}
          title={t('trips.legs.switchMode', 'Switch transport mode')}
          aria-label={t('trips.legs.modeAria', 'Transport mode: {{mode}} — click to change', {
            mode: t(`trips.legs.mode.${leg.mode}`, leg.mode),
          })}
          className="inline-flex items-center gap-1 rounded-badge px-1 py-0.5 hover:bg-muted hover:text-foreground transition-colors"
        >
          <Icon className="w-3 h-3" aria-hidden />
          <span>
            {formatLegDistance(leg.distanceKm)} · {duration}
          </span>
        </button>
      )}
    </div>
  );
}
