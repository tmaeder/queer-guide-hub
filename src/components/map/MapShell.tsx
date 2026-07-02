import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { tweens } from '@/lib/motion';
import { distance } from '@/lib/animation';
import { ExploreMap } from './ExploreMap';
import { CommandBar } from './CommandBar';
import { MobileMapBar } from './chrome/MobileMapBar';
import { FilterChips } from './FilterChips';
import { useIsMobile } from '@/hooks/use-mobile';
import { MapLegend } from './MapLegend';
import { SpotlightRail } from './SpotlightRail';
import { MapFirstRunHint } from './MapFirstRunHint';
import type { MapPointSummary } from './mapPoint';
import { useMapShellState } from '@/hooks/useMapShellState';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useFavorites } from '@/hooks/useFavorites';
import {
  SURFACE_PRESETS,
  type MapShellConfig,
  type MapShellFilters,
  type MapSurface,
} from './MapShell.types';
import type { LayerType } from '@/hooks/useExploreMapData';
import { lensToRenderMode, exploreLayersFor } from './mapShellAdapters';
import { PreferenceChips } from '@/components/preferences/PreferenceChips';
import { usePreferenceChips, accessibilitySlugsFromChips } from '@/hooks/usePreferenceChips';

export interface MapShellProps {
  surface: MapSurface;
  /** Optional per-instance overrides on top of the preset (lens list, filter list, etc.) */
  configOverride?: Partial<MapShellConfig>;
  height?: number | string;
  className?: string;
  /** Initial center override [lng, lat]; supersedes URL state for non-discover surfaces */
  initialCenter?: [number, number];
  initialZoom?: number;
  /** Skip the auto-fly to visitor geolocation */
  skipAutoFly?: boolean;
  /** Cooperative gestures — wheel-scroll passes through to the page (zoom needs
   *  a modifier). Use when the shell is embedded above page content. */
  cooperativeGestures?: boolean;
}

/**
 * Unified map shell. Composes the existing ExploreMap (Pins lens) with a
 * single top command bar, an optional row of filter chips, and the lens
 * picker. URL state (when enabled) is owned by useMapShellState.
 *
 * Phase 1 status: Pins lens fully wired; Density/Routes/Boundary lenses
 * fall through to Pins until their dedicated lens components ship. Lens
 * switching still persists via URL state.
 */
export const MapShell = ({
  surface,
  configOverride,
  height = 'calc(100dvh - 64px)',
  className,
  initialCenter,
  initialZoom,
  skipAutoFly,
  cooperativeGestures,
}: MapShellProps) => {
  const config: MapShellConfig = useMemo(
    () => ({ ...SURFACE_PRESETS[surface], ...configOverride }),
    [surface, configOverride],
  );

  const reducedMotion = useReducedMotion() ?? false;
  const isMobile = useIsMobile();
  const { state, setLens, setLayers, setFilters, setViewport } = useMapShellState(config);
  const { toast } = useToast();
  const { t } = useTranslation();

  // Spotlight rail state — the in-view point feed + hover/selection sync.
  const [pointsInView, setPointsInView] = useState<MapPointSummary[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const showRail = config.showCommandBar !== false;

  // Favorites layer — the viewer's saved venues + events, prefixed to match
  // the map's feature ids (`venue-<id>` / `event-<id>`).
  const { user } = useAuth();
  const { favoriteIds: savedVenueIds } = useFavorites('venue');
  const { favoriteIds: savedEventIds } = useFavorites('event');
  const favoriteKey =
    [...savedVenueIds].sort().join(',') + '|' + [...savedEventIds].sort().join(',');
  const favoriteIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of savedVenueIds) set.add(`venue-${id}`);
    for (const id of savedEventIds) set.add(`event-${id}`);
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- favoriteKey captures Set contents
  }, [favoriteKey]);
  const canSave = !!user;
  const savedActive = savedOnly && canSave;

  // Drop filter keys we don't expose on this surface so they can't leak in via URL.
  const exposedFilters: MapShellFilters = useMemo(() => {
    const f = state.filters;
    const out: MapShellFilters = {};
    if (config.filters.includes('category') && f.category) out.category = f.category;
    if (config.filters.includes('tags') && f.tags?.length) out.tags = f.tags;
    if (config.filters.includes('near-me') && f.nearMe) out.nearMe = f.nearMe;
    if (config.filters.includes('time') && f.dateRange) out.dateRange = f.dateRange;
    if (config.filters.includes('accessibility') && f.accessible) out.accessible = f.accessible;
    if (config.filters.includes('queer-owned') && f.queerOwned) out.queerOwned = f.queerOwned;
    if (config.filters.includes('era') && f.era) out.era = f.era;
    if (f.search) out.search = f.search;
    // Quick filters are available on every command-bar surface, independent of
    // the preset's filter list, so pass them through unconditionally.
    if (f.openNow) out.openNow = f.openNow;
    if (f.dateRange) out.dateRange = f.dateRange;
    return out;
  }, [state.filters, config.filters]);

  // Traveling preference chips — saved accessibility needs flip the map's
  // accessible filter by default on surfaces that expose it. The chip is the
  // control; the contribution merges into the map's filters without touching
  // shell/URL state (accessibility needs are private).
  const supportsAccessibility = config.filters.includes('accessibility');
  const { chips: prefChips, toggle: togglePrefChip, forget: forgetPrefChip } =
    usePreferenceChips(supportsAccessibility ? ['accessibility'] : []);
  const chipAccessible = accessibilitySlugsFromChips(prefChips).length > 0;
  const mapFilters: MapShellFilters = useMemo(
    () =>
      chipAccessible && !exposedFilters.accessible
        ? { ...exposedFilters, accessible: true }
        : exposedFilters,
    [exposedFilters, chipAccessible],
  );

  const removeFilter = useCallback(
    (key: keyof MapShellFilters) => {
      const next: MapShellFilters = { ...state.filters };
      delete next[key];
      setFilters(next);
    },
    [state.filters, setFilters],
  );

  // Lens → ExploreMap config adapter. Boundary auto-enables area layers
  // from the surface preset (otherwise the polygons users came to see
  // wouldn't render). Density only needs point layers (the heatmap
  // computes density from points, not boundaries).
  const exploreLayers: LayerType[] = useMemo(
    () => exploreLayersFor(state.lens, state.enabledLayers, config.layers),
    [state.lens, state.enabledLayers, config.layers],
  );

  const handleViewportChange = useCallback(
    (vp: { center: [number, number]; zoom: number }) => {
      setViewport(vp);
    },
    [setViewport],
  );

  const handleLayersChange = useCallback(
    (next: LayerType[]) => {
      setLayers(next);
    },
    [setLayers],
  );

  const fallbackCenter = state.viewport?.center ?? initialCenter;
  const fallbackZoom = state.viewport?.zoom ?? initialZoom;
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    const payload = {
      title: t('map.share.title', { defaultValue: 'Map view' }),
      url,
    };
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share(payload);
        return;
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      // Fall through to clipboard.
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: t('map.share.copied', { defaultValue: 'Link copied' }),
        description: t('map.share.copiedDescription', { defaultValue: 'Paste to share this view' }),
      });
    } catch {
      toast({
        title: t('map.share.failed', { defaultValue: 'Share failed' }),
        variant: 'destructive',
      });
    }
  }, [t, toast]);

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) {
      toast({
        title: t('map.geolocate.unsupported', { defaultValue: 'Geolocation unavailable' }),
        variant: 'destructive',
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setViewport({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: Math.max(state.viewport?.zoom ?? 12, 12),
        });
      },
      (err) => {
        // Match the PositionError codes so the user knows why we fell back
        // to the default view instead of getting a silent or generic
        // "denied" message for what might be a timeout or hardware issue.
        let title: string;
        switch (err.code) {
          case 1: // PERMISSION_DENIED
            title = t('map.geolocate.denied', {
              defaultValue: 'Location access is off — showing the default area',
            });
            break;
          case 2: // POSITION_UNAVAILABLE
            title = t('map.geolocate.unavailable', {
              defaultValue: "Couldn't get your location — showing the default area",
            });
            break;
          case 3: // TIMEOUT
            title = t('map.geolocate.timeout', {
              defaultValue: 'Location lookup timed out — showing the default area',
            });
            break;
          default:
            title = t('map.geolocate.denied', {
              defaultValue: 'Location access is off — showing the default area',
            });
        }
        // Informational, not destructive — the map stays usable and we
        // tell the user what happened.
        toast({ title });
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [setViewport, state.viewport?.zoom, t, toast]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className ?? ''}`}
      style={{ height }}
      data-map-surface={surface}
      data-map-lens={state.lens}
    >
      <ExploreMap
        height={height}
        defaultLayers={exploreLayers}
        defaultFilters={mapFilters}
        showLayerToggles={false}
        showFilters={false}
        initialCenter={fallbackCenter}
        initialZoom={fallbackZoom}
        skipAutoFly={skipAutoFly ?? fallbackCenter != null}
        onViewportChange={handleViewportChange}
        onLayersChange={handleLayersChange}
        renderMode={lensToRenderMode(state.lens)}
        mapShellMode
        onPointsInView={showRail ? setPointsInView : undefined}
        selectedId={selectedId}
        highlightedId={hoveredId}
        showResultCount={!showRail}
        onSelectPoint={showRail ? setSelectedId : undefined}
        onFetchingChange={showRail ? setFetching : undefined}
        favoriteIds={favoriteIds}
        savedOnly={savedActive}
        cooperativeGestures={cooperativeGestures}
      />

      {showRail && (
        <>
          <MapLegend lens={state.lens} layers={exploreLayers} raised />
          <SpotlightRail
            points={pointsInView}
            selectedId={selectedId}
            loading={fetching}
            onHover={setHoveredId}
            onSelect={(id) => setSelectedId(id)}
          />
        </>
      )}

      {config.showCommandBar !== false &&
        (isMobile ? (
          /* Mobile: one top stack — fixed control row, scrollable quick chips,
             then any active-filter chips flowing below (no absolute overlap). */
          <div className="absolute inset-x-3 top-3 z-20 flex flex-col gap-1.5">
            <MobileMapBar
              showSearch={config.showSearch}
              lenses={config.lenses}
              lens={state.lens}
              onLensChange={setLens}
              availableLayers={config.layers}
              enabledLayers={state.enabledLayers}
              onLayersChange={setLayers}
              availableFilters={config.filters}
              filters={state.filters}
              onFiltersChange={setFilters}
              onGeolocate={handleGeolocate}
              onShare={handleShare}
              canSave={canSave}
              savedOnly={savedActive}
              onToggleSaved={() => setSavedOnly((v) => !v)}
            />
            <AnimatePresence initial={false}>
              {(Object.keys(exposedFilters).length > 0 || prefChips.length > 0) && (
                <motion.div
                  initial={reducedMotion ? false : { opacity: 0, y: -distance.sm }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -distance.sm }}
                  transition={reducedMotion ? { duration: 0 } : tweens.fast}
                  className="flex flex-col gap-1.5"
                >
                  <PreferenceChips
                    chips={prefChips}
                    onToggle={togglePrefChip}
                    onForget={forgetPrefChip}
                  />
                  <FilterChips
                    filters={exposedFilters}
                    onRemove={removeFilter}
                    onClearAll={() => setFilters({})}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <>
            <CommandBar
              showSearch={config.showSearch}
              lenses={config.lenses}
              lens={state.lens}
              onLensChange={setLens}
              availableLayers={config.layers}
              enabledLayers={state.enabledLayers}
              onLayersChange={setLayers}
              availableFilters={config.filters}
              filters={state.filters}
              onFiltersChange={setFilters}
              onGeolocate={handleGeolocate}
              onShare={handleShare}
              canSave={canSave}
              savedOnly={savedActive}
              onToggleSaved={() => setSavedOnly((v) => !v)}
            />
            <AnimatePresence initial={false}>
              {(Object.keys(exposedFilters).length > 0 || prefChips.length > 0) && (
                <motion.div
                  initial={reducedMotion ? false : { opacity: 0, y: -distance.sm }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -distance.sm }}
                  transition={reducedMotion ? { duration: 0 } : tweens.fast}
                  className="absolute top-[3.25rem] left-3 right-3 z-20 flex flex-col gap-1.5"
                >
                  <PreferenceChips
                    chips={prefChips}
                    onToggle={togglePrefChip}
                    onForget={forgetPrefChip}
                  />
                  <FilterChips
                    filters={exposedFilters}
                    onRemove={removeFilter}
                    onClearAll={() => setFilters({})}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ))}

      {showRail && (
        <MapFirstRunHint count={pointsInView.length} ready={!fetching} />
      )}
    </div>
  );
};

export default MapShell;
