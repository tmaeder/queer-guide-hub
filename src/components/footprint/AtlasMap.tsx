import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Loader2, Check, Bookmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getMapStyle } from '@/config/mapStyle';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useCountryBoundaries } from '@/hooks/useBoundaryData';
import { useAtlas, useToggleCountryMark } from '@/hooks/useAtlas';

/** Resolve a design token to a concrete hsl() string for MapLibre paint. */
function tokenColor(varName: string, alpha?: number): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return alpha != null ? `hsl(${raw} / ${alpha})` : `hsl(${raw})`;
}

const SRC = 'atlas-countries';

/**
 * Profile world map: countries visited (from completed trips + manual marks,
 * filled) and the bucket list (outlined). Click a country to toggle marks in
 * the panel below. Strictly monochrome — colors resolve from design tokens.
 */
export function AtlasMap() {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const { countries, lookup, isLoading } = useAtlas();
  const { data: boundaries } = useCountryBoundaries(true, 1);
  const toggle = useToggleCountryMark();

  const visitedCodes = useMemo(
    () =>
      countries
        .filter((c) => (c.visitedFromTrips || c.visitedManual) && c.code)
        .map((c) => c.code!.toUpperCase()),
    [countries],
  );
  const bucketCodes = useMemo(
    () => countries.filter((c) => c.bucket && c.code).map((c) => c.code!.toUpperCase()),
    [countries],
  );

  const byCode = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const c of lookup) if (c.code) m.set(c.code.toUpperCase(), { id: c.id, name: c.name });
    return m;
  }, [lookup]);

  // Init map — recreated when the theme flips so the basemap flavor follows it
  // (and the token-resolved layer colors re-read the new theme's values).
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: getMapStyle(resolvedTheme),
      center: [10, 25],
      zoom: 0.9,
      attributionControl: false,
      dragRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    // Ref publishes on `load` so the boundary effect never touches a style
    // that is still loading (theme-toggle recreate window).
    map.on('load', () => {
      mapRef.current = map;
      setMapReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [resolvedTheme]);

  // (Re)wire boundary source + layers whenever data changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !boundaries) return;

    const visited = visitedCodes.length ? visitedCodes : ['__none__'];
    const bucket = bucketCodes.length ? bucketCodes : ['__none__'];

    const existing = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(boundaries);
    } else {
      map.addSource(SRC, { type: 'geojson', data: boundaries });
      map.addLayer({
        id: 'atlas-base',
        type: 'fill',
        source: SRC,
        paint: {
          'fill-color': tokenColor('--muted-foreground', 0.12),
          'fill-outline-color': tokenColor('--border'),
        },
      });
      map.addLayer({
        id: 'atlas-visited',
        type: 'fill',
        source: SRC,
        paint: { 'fill-color': tokenColor('--foreground', 0.72) },
        filter: ['in', ['get', 'ISO_A2'], ['literal', visited]],
      });
      map.addLayer({
        id: 'atlas-bucket',
        type: 'line',
        source: SRC,
        paint: {
          'line-color': tokenColor('--foreground'),
          'line-width': 1.5,
          'line-dasharray': [2, 1.5],
        },
        filter: ['in', ['get', 'ISO_A2'], ['literal', bucket]],
      });

      map.on('click', (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ['atlas-base'] });
        const iso = hits[0]?.properties?.ISO_A2 as string | undefined;
        setSelectedCode(iso ? iso.toUpperCase() : null);
      });
      map.on('mousemove', (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ['atlas-base'] });
        map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
      });
      return;
    }

    map.setFilter('atlas-visited', ['in', ['get', 'ISO_A2'], ['literal', visited]]);
    map.setFilter('atlas-bucket', ['in', ['get', 'ISO_A2'], ['literal', bucket]]);
  }, [mapReady, boundaries, visitedCodes, bucketCodes]);

  const selected = selectedCode ? byCode.get(selectedCode) : null;
  const selectedState = selected
    ? countries.find((c) => c.countryId === selected.id)
    : null;
  const visitedOn = !!(selectedState?.visitedManual || selectedState?.visitedFromTrips);
  const bucketOn = !!selectedState?.bucket;

  return (
    <div>
      <div className="relative h-[320px] md:h-[420px] rounded-container overflow-hidden border border-border">
        <div ref={mapContainer} className="absolute inset-0" />
        {(isLoading || !boundaries) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40">
            <Loader2 className="h-5 w-5 animate-spin" aria-label={t('common.loading', 'Loading')} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 mt-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {t('atlas.summary', '{{visited}} countries visited · {{bucket}} on your bucket list', {
            visited: visitedCodes.length,
            bucket: bucketCodes.length,
          })}
        </p>
        {!selected && (
          <p className="text-xs text-muted-foreground">
            {t('atlas.hint', 'Tap a country to mark it')}
          </p>
        )}
      </div>

      {selected && (
        <div className="flex items-center gap-2 mt-2 flex-wrap" data-testid="atlas-country-panel">
          <Badge variant="outline">{selected.name}</Badge>
          <Button
            size="sm"
            variant={visitedOn ? 'default' : 'outline'}
            disabled={toggle.isPending || !!selectedState?.visitedFromTrips}
            title={
              selectedState?.visitedFromTrips
                ? t('atlas.fromTrips', 'Marked visited by a completed trip')
                : undefined
            }
            onClick={() =>
              toggle.mutate({
                countryId: selected.id,
                kind: 'visited',
                on: !selectedState?.visitedManual,
              })
            }
            className="h-8"
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            {t('atlas.visited', 'Visited')}
          </Button>
          <Button
            size="sm"
            variant={bucketOn ? 'default' : 'outline'}
            disabled={toggle.isPending}
            onClick={() =>
              toggle.mutate({ countryId: selected.id, kind: 'saved', on: !bucketOn })
            }
            className="h-8"
          >
            <Bookmark className="w-3.5 h-3.5 mr-1" />
            {t('atlas.bucket', 'Bucket list')}
          </Button>
        </div>
      )}
    </div>
  );
}
