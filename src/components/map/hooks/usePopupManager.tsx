import { useCallback, useContext, type MutableRefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import i18next from 'i18next';
import maplibregl from 'maplibre-gl';
import { MapEntityCard } from '@/components/map/MapEntityCard';
import type { MapPointSummary } from '@/components/map/mapPoint';
import type { MapMarker } from '@/hooks/useExploreMapData';
import { hapticTrigger } from '@/hooks/useHaptics';
import { AuthContext } from '@/hooks/useAuth';

interface UsePopupManagerParams {
  navigate: (href: string) => void;
  toast: (opts: { title: string; description?: string; variant?: 'destructive' }) => void;
  popupRef: MutableRefObject<maplibregl.Popup | null>;
  popupRootRef: MutableRefObject<Root | null>;
}

/**
 * Native-share + rich React-rendered MapLibre popup management. Extracted
 * verbatim from ExploreMap — behavior-preserving. `popupRef`/`popupRootRef`
 * stay component-owned because the init-effect teardown also unmounts the root.
 */
export function usePopupManager({ navigate, toast, popupRef, popupRootRef }: UsePopupManagerParams) {
  // The popup renders into its own React root (MapLibre owns the DOM node),
  // which is OUTSIDE the app's provider tree — so bridge the contexts the
  // card actually needs (auth + react-query for QuietAddToTripButton /
  // AddToTripDialog). Without this, opening a popup crashed with
  // "useAuth must be used within an AuthProvider" (feedback story f615cdd2).
  // useContext (not useAuth) so provider-less test renders don't throw at mount.
  const auth = useContext(AuthContext);
  const queryClient = useQueryClient();

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
  // Mounts <MapEntityCard> into the popup's DOM node via a React root (replaces
  // the old inline-HTML string). The root is torn down on popup close / replace.
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

      const root = createRoot(container);
      root.render(
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={auth}>
            <MapEntityCard
              point={point}
              variant="popup"
              onNavigate={(href) => navigate(href)}
              onShare={sharePoint}
            />
          </AuthContext.Provider>
        </QueryClientProvider>,
      );
      popupRootRef.current = root;

      popup.on('close', () => {
        // Defer unmount out of MapLibre's event tick to avoid React's
        // "synchronously unmounting during render" warning.
        const r = popupRootRef.current;
        popupRootRef.current = null;
        if (r) setTimeout(() => r.unmount(), 0);
      });

      popupRef.current = popup;
    },
    [navigate, sharePoint, popupRef, popupRootRef, auth, queryClient],
  );

  // Adapter for callers that still produce the legacy MapMarker shape
  // (area circles, boundary polygons). Maps it onto a MapPointSummary.
  const showPopupFromMarker = useCallback(
    (map: maplibregl.Map, lngLat: maplibregl.LngLat, marker: MapMarker) => {
      const meta = (marker.meta ?? {}) as Record<string, unknown>;
      showPopup(map, lngLat, {
        id: String(marker.id),
        type: marker.type,
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

  return { showPopup, showPopupFromMarker };
}
