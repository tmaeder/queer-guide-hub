import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { mapStyle } from '@/config/mapStyle';
import { useCountryCentroids, type CountryCentroid } from '@/hooks/useCountryCentroids';
import type { Personality } from '@/hooks/usePersonalities';

interface PersonalitiesMapProps {
  personalities: Personality[];
  height?: number | string;
}

/**
 * Tiny demonym→country map for common forms (American → United States).
 * Fallback path: if the raw nationality doesn't match a country name,
 * try this lookup before giving up.
 */
const DEMONYM: Record<string, string> = {
  american: 'united states',
  british: 'united kingdom',
  english: 'united kingdom',
  scottish: 'united kingdom',
  welsh: 'united kingdom',
  irish: 'ireland',
  french: 'france',
  german: 'germany',
  italian: 'italy',
  spanish: 'spain',
  dutch: 'netherlands',
  portuguese: 'portugal',
  swedish: 'sweden',
  norwegian: 'norway',
  danish: 'denmark',
  finnish: 'finland',
  swiss: 'switzerland',
  austrian: 'austria',
  polish: 'poland',
  russian: 'russia',
  ukrainian: 'ukraine',
  canadian: 'canada',
  mexican: 'mexico',
  brazilian: 'brazil',
  argentine: 'argentina',
  argentinian: 'argentina',
  chilean: 'chile',
  australian: 'australia',
  'new zealander': 'new zealand',
  kiwi: 'new zealand',
  japanese: 'japan',
  chinese: 'china',
  korean: 'south korea',
  indian: 'india',
  thai: 'thailand',
  vietnamese: 'vietnam',
  filipino: 'philippines',
  indonesian: 'indonesia',
  greek: 'greece',
  turkish: 'turkey',
  israeli: 'israel',
  egyptian: 'egypt',
  'south african': 'south africa',
  nigerian: 'nigeria',
  kenyan: 'kenya',
  belgian: 'belgium',
  czech: 'czechia',
  hungarian: 'hungary',
  romanian: 'romania',
  bulgarian: 'bulgaria',
  cuban: 'cuba',
  colombian: 'colombia',
  peruvian: 'peru',
  venezuelan: 'venezuela',
  icelandic: 'iceland',
};

function lookupCountry(
  nationality: string,
  index: Map<string, CountryCentroid>,
): CountryCentroid | null {
  const key = nationality.trim().toLowerCase();
  if (!key) return null;
  if (index.has(key)) return index.get(key)!;
  const demonym = DEMONYM[key];
  if (demonym && index.has(demonym)) return index.get(demonym)!;
  return null;
}

interface Feature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: string;
    slug: string;
    name: string;
    profession: string;
    image_url: string;
  };
}

const SOURCE_ID = 'personalities-source';
const CLUSTERS_LAYER = 'personalities-clusters';
const CLUSTER_COUNT_LAYER = 'personalities-cluster-count';
const POINTS_LAYER = 'personalities-points';

export function PersonalitiesMap({ personalities, height = 600 }: PersonalitiesMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const navigate = useLocalizedNavigate();
  const { centroids, loading: countriesLoading } = useCountryCentroids();
  const [unmappedCount, setUnmappedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Initialize map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [0, 30],
      zoom: 1.5,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Build features whenever the input list or country centroids change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (countriesLoading) return;
    const index = new Map(centroids.map((c) => [c.name, c]));
    {

      const features: Feature[] = [];
      let unmapped = 0;
      for (const p of personalities) {
        if (!p.nationality) {
          unmapped++;
          continue;
        }
        const country = lookupCountry(p.nationality, index);
        if (!country) {
          unmapped++;
          continue;
        }
        // Jitter slightly so points at the same country centroid don't pile on top.
        const jitterLng = (Math.random() - 0.5) * 2;
        const jitterLat = (Math.random() - 0.5) * 1.2;
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [country.longitude + jitterLng, country.latitude + jitterLat],
          },
          properties: {
            id: p.id,
            slug: p.slug ?? p.id,
            name: p.name,
            profession: p.profession ?? '',
            image_url: p.image_url ?? '',
          },
        });
      }

      setUnmappedCount(unmapped);
      setLoading(false);

      const geojson = { type: 'FeatureCollection' as const, features };

      const apply = () => {
        const existing = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
        if (existing) {
          existing.setData(geojson);
          return;
        }
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: geojson,
          cluster: true,
          clusterMaxZoom: 6,
          clusterRadius: 50,
        });

        map.addLayer({
          id: CLUSTERS_LAYER,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          paint: {
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              16, 10, 22, 50, 28, 100, 36,
            ],
            'circle-color': 'hsl(0, 0%, 10%)',
            'circle-stroke-width': 2,
            'circle-stroke-color': 'hsl(0, 0%, 100%)',
            'circle-opacity': 0.9,
          },
        });

        map.addLayer({
          id: CLUSTER_COUNT_LAYER,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['Noto Sans Medium'],
            'text-size': 12,
          },
          paint: { 'text-color': 'hsl(0, 0%, 100%)' },
        });

        map.addLayer({
          id: POINTS_LAYER,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': 6,
            'circle-color': 'hsl(0, 0%, 10%)',
            'circle-stroke-width': 2,
            'circle-stroke-color': 'hsl(0, 0%, 100%)',
          },
        });

        map.on('click', CLUSTERS_LAYER, async (e: MapLayerMouseEvent) => {
          const feat = e.features?.[0];
          if (!feat) return;
          const clusterId = feat.properties?.cluster_id;
          const src = map.getSource(SOURCE_ID) as GeoJSONSource;
          try {
            const zoom = await src.getClusterExpansionZoom(clusterId);
            map.flyTo({
              center: (feat.geometry as GeoJSON.Point).coordinates as [number, number],
              zoom: zoom + 0.5,
              speed: 1.5,
            });
          } catch {
            /* ignore */
          }
        });

        map.on('click', POINTS_LAYER, (e: MapLayerMouseEvent) => {
          const feat = e.features?.[0];
          if (!feat) return;
          const props = feat.properties as { slug: string; name: string; profession: string; image_url: string };
          const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];

          const popupNode = document.createElement('div');
          popupNode.style.maxWidth = '200px';
          popupNode.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;">
              ${props.image_url
                ? `<img src="${props.image_url}" alt="" style="width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0;" />`
                : ''}
              <div style="min-width:0;">
                <div style="font-weight:600;font-size:13px;">${escapeHtml(props.name)}</div>
                <div style="font-size:11px;color:#666;">${escapeHtml(props.profession || '')}</div>
              </div>
            </div>
          `;
          popupNode.style.cursor = 'pointer';
          popupNode.addEventListener('click', () => {
            navigate(`/personalities/${props.slug}`);
          });

          new maplibregl.Popup({ closeButton: false, offset: 12 })
            .setLngLat(coords)
            .setDOMContent(popupNode)
            .addTo(map);
        });

        for (const layer of [CLUSTERS_LAYER, POINTS_LAYER]) {
          map.on('mouseenter', layer, () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', layer, () => {
            map.getCanvas().style.cursor = '';
          });
        }
      };

      if (map.isStyleLoaded()) apply();
      else map.once('load', apply);
    }
  }, [personalities, navigate, centroids, countriesLoading]);

  return (
    <div>
      <div
        ref={containerRef}
        style={{ width: '100%', height, borderRadius: 8 }}
        role="region"
        aria-label="Map of personalities by country"
      />
      {!loading && unmappedCount > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          {unmappedCount.toLocaleString()} personalit
          {unmappedCount === 1 ? 'y' : 'ies'} not shown (missing or unrecognised nationality)
        </p>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
