import { useCallback, useState, type MutableRefObject, type ReactPortal } from 'react';
import { createPortal } from 'react-dom';
import type { Root } from 'react-dom/client';
import i18next from 'i18next';
import * as maplibregl from 'maplibre-gl';
import { MapEntityCard } from '@/components/map/MapEntityCard';
import { ENTITY_BULLET, lineFor } from '@/components/map/mapDomain';
import type { MapPointSummary } from '@/components/map/mapPoint';
import type { MapMarker } from '@/hooks/useExploreMapData';
import { hapticTrigger } from '@/hooks/useHaptics';

interface UsePopupManagerParams {
  navigate: (href: string) => void;
  toast: (opts: { title: string; description?: string; variant?: 'destructive' }) => void;
  popupRef: MutableRefObject<maplibregl.Popup | null>;
  /** Holds a handle whose `unmount()` closes the card; kept as a `Root` so the
   *  map teardowns that already call `popupRootRef.current?.unmount()` keep
   *  working unchanged. */
  popupRootRef: MutableRefObject<Root | null>;
}

/**
 * Native-share + rich React-rendered MapLibre popup management. Extracted
 * verbatim from ExploreMap — behavior-preserving. `popupRef`/`popupRootRef`
 * stay component-owned because the init-effect teardown also unmounts the root.
 */
export function usePopupManager({
  navigate,
  toast,
  popupRef,
  popupRootRef,
}: UsePopupManagerParams) {
  // The card is rendered through a PORTAL into MapLibre's popup node, so it
  // stays inside the app's React tree and gets every provider (router, auth,
  // active trip, react-query, i18n, toasts). It used to be a separate
  // createRoot, outside the tree, with contexts bridged in one at a time:
  // auth after "useAuth must be used within an AuthProvider" (feedback story
  // f615cdd2), then production threw "useActiveTrip must be used within
  // ActiveTripProvider" and, once that was bridged, "useNavigate() may be used
  // only in the context of a <Router>" — the popup rendered empty. A portal
  // ends that class of bug instead of chasing the next missing context.
  const [card, setCard] = useState<{ container: HTMLElement; point: MapPointSummary } | null>(null);

  // ── Helper: native share with clipboard fallback ─────────────────────────
  const sharePoint = useCallback(
    async (point: MapPointSummary) => {
      hapticTrigger('nudge');
      if (!point.linkTo) return;
      const absoluteUrl = new URL(point.linkTo, window.location.origin).toString();
      const payload = { title: point.name, text: point.subtitle || point.name, url: absoluteUrl };

      const fallbackToClipboard = async () => {
        try {
          await navigator.clipboard.writeText(absoluteUrl);
          toast({
            title: i18next.t('map.popup.linkCopied', { defaultValue: 'Link copied' }),
            description: i18next.t('map.popup.linkCopiedDescription', {
              defaultValue: 'You can paste it now',
            }),
          });
        } catch {
          toast({
            title: i18next.t('map.popup.shareFailed', { defaultValue: 'Share failed' }),
            variant: 'destructive',
          });
        }
      };

      if (typeof navigator.share === 'function') {
        try {
          await navigator.share(payload);
        } catch (err) {
          if ((err as { name?: string })?.name === 'AbortError') return;
          await fallbackToClipboard();
        }
      } else {
        await fallbackToClipboard();
      }
    },
    [toast],
  );

  // ── Helper: show a rich React-rendered popup card ─────────────────────────
  // Portals <MapEntityCard> into the popup's DOM node (see `card` above). The
  // card is cleared on popup close / replace.
  const showPopup = useCallback(
    (map: maplibregl.Map, lngLat: maplibregl.LngLat | [number, number], point: MapPointSummary) => {
      hapticTrigger('nudge');
      popupRootRef.current?.unmount();
      popupRootRef.current = null;
      popupRef.current?.remove();

      const container = document.createElement('div');
      const popup = new maplibregl.Popup({
        offset: 16,
        closeButton: true,
        maxWidth: '260px',
        className: 'venue-rich-popup',
      })
        .setLngLat(lngLat)
        .setDOMContent(container)
        .addTo(map);

      setCard({ container, point });
      // Closing clears only THIS card, never one opened after it.
      popupRootRef.current = {
        unmount: () => setCard((c) => (c?.container === container ? null : c)),
        render: () => {},
      } as unknown as Root;

      popup.on('close', () => {
        // Defer unmount out of MapLibre's event tick to avoid React's
        // "synchronously unmounting during render" warning.
        const r = popupRootRef.current;
        popupRootRef.current = null;
        if (r) setTimeout(() => r.unmount(), 0);
      });

      popupRef.current = popup;
    },
    [popupRef, popupRootRef],
  );

  // Adapter for callers that still produce the legacy MapMarker shape
  // (area circles, boundary polygons). Maps it onto a MapPointSummary.
  const showPopupFromMarker = useCallback(
    (map: maplibregl.Map, lngLat: maplibregl.LngLat, marker: MapMarker) => {
      const meta = (marker.meta ?? {}) as Record<string, unknown>;
      const category = typeof meta.category === 'string' ? meta.category : undefined;
      showPopup(map, lngLat, {
        id: String(marker.id),
        type: marker.type,
        entity: ENTITY_BULLET[marker.type],
        // `null` for every area type, which is the whole point of this adapter:
        // a boundary polygon is not on a line and must not paint like one.
        line: lineFor(marker.type, category),
        name: marker.name,
        subtitle: marker.subtitle,
        lng: marker.lng,
        lat: marker.lat,
        linkTo: marker.linkTo,
        color: marker.color,
        featured: Boolean(meta.featured),
        live: false,
        image: typeof meta.image === 'string' ? meta.image : undefined,
        category: typeof meta.category === 'string' ? meta.category : undefined,
        city: typeof meta.city === 'string' ? meta.city : undefined,
      });
    },
    [showPopup],
  );

  const popupPortal: ReactPortal | null = card
    ? createPortal(
        <MapEntityCard
          point={card.point}
          variant="popup"
          onNavigate={(href) => navigate(href)}
          onShare={sharePoint}
        />,
        card.container,
      )
    : null;

  return { showPopup, showPopupFromMarker, popupPortal };
}
