import { useTranslation } from 'react-i18next';
import { LAYER_COLORS } from '@/hooks/useExploreMapData';
import type { EntityMapMarker } from '@/components/map/EntityMap';

/**
 * Tiny colour-keyed legend for a detail-page map that carries nearby points.
 * Colours mirror the functional map palette (LAYER_COLORS) — the documented
 * map-colour exception, not chrome — and render nothing when there's nothing
 * nearby.
 */
export function NearbyMapLegend({ markers }: { markers: EntityMapMarker[] }) {
  const { t } = useTranslation();
  // Classify by linkTo prefix — robust to markers whose `type` is unset
  // (the shared hook leaves hotels' type undefined but sets their link).
  const venues = markers.filter((m) => m.linkTo?.startsWith('/venues')).length;
  const events = markers.filter((m) => m.linkTo?.startsWith('/events')).length;
  const hotels = markers.filter((m) => m.linkTo?.startsWith('/hotels')).length;
  if (venues + events + hotels === 0) return null;

  const items: Array<{ color: string; label: string }> = [];
  if (venues > 0)
    items.push({
      color: LAYER_COLORS.venues,
      label:
        venues === 1
          ? t('pages.entityDetail.nearbyPlace', '1 nearby place')
          : t('pages.entityDetail.nearbyPlaces', '{{count}} nearby places', { count: venues }),
    });
  if (events > 0)
    items.push({
      color: LAYER_COLORS.events,
      label:
        events === 1
          ? t('pages.entityDetail.nearbyEvent', '1 nearby event')
          : t('pages.entityDetail.nearbyEvents', '{{count}} nearby events', { count: events }),
    });
  if (hotels > 0)
    items.push({
      color: LAYER_COLORS.hotels,
      label:
        hotels === 1
          ? t('pages.entityDetail.nearbyStay', '1 nearby stay')
          : t('pages.entityDetail.nearbyStays', '{{count}} nearby stays', { count: hotels }),
    });

  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: it.color }}
            aria-hidden="true"
          />
          {it.label}
        </span>
      ))}
    </p>
  );
}

export default NearbyMapLegend;
