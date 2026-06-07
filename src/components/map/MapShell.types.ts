import type { LayerType, ExploreMapFilters } from '@/hooks/useExploreMapData';

export type MapSurface = 'discover' | 'search' | 'city' | 'country' | 'trip' | 'admin';

export type MapLens = 'pins' | 'density' | 'routes' | 'boundary' | 'combined';

export type MapFilterKey =
  | 'category'
  | 'tags'
  | 'near-me'
  | 'time'
  | 'accessibility'
  | 'queer-owned'
  | 'price'
  | 'safety'
  | 'era';

export interface MapShellFilters extends ExploreMapFilters {
  queerOwned?: boolean;
  era?: { decadeStart: number; decadeEnd: number };
}

export interface MapShellConfig {
  surface: MapSurface;
  lenses: MapLens[];
  defaultLens: MapLens;
  layers: LayerType[];
  filters: MapFilterKey[];
  showCommandBar?: boolean;
  enableSearchThisArea?: boolean;
  enableUrlState?: boolean;
}

export interface MapShellState {
  lens: MapLens;
  enabledLayers: LayerType[];
  filters: MapShellFilters;
  viewport?: { center: [number, number]; zoom: number };
}

export const FILTER_LABELS: Record<MapFilterKey, string> = {
  category: 'Category',
  tags: 'Tags',
  'near-me': 'Near me',
  time: 'Time',
  accessibility: 'Accessibility',
  'queer-owned': 'Queer-owned',
  price: 'Price',
  safety: 'Safety',
  era: 'Era',
};

export const LENS_LABELS: Record<MapLens, string> = {
  pins: 'Pins',
  density: 'Density',
  routes: 'Routes',
  boundary: 'Boundary',
  combined: 'Combined',
};

export const SURFACE_PRESETS: Record<MapSurface, MapShellConfig> = {
  discover: {
    surface: 'discover',
    lenses: ['combined', 'pins', 'density', 'boundary'],
    defaultLens: 'combined',
    layers: ['venues', 'events', 'hotels', 'restrooms', 'neighbourhoods', 'cities', 'countries'],
    // Only data-backed filters are exposed. accessibility_attributes (0 rows)
    // and target_groups (~0.2% populated) would empty the map, so they're
    // dropped until the data lands; era has no point layer to act on.
    filters: ['category', 'tags', 'near-me', 'time'],
    showCommandBar: true,
    enableSearchThisArea: true,
    enableUrlState: true,
  },
  search: {
    surface: 'search',
    lenses: ['pins'],
    defaultLens: 'pins',
    layers: ['venues', 'events'],
    filters: ['near-me'],
    showCommandBar: true,
    enableSearchThisArea: true,
    enableUrlState: false,
  },
  city: {
    surface: 'city',
    lenses: ['combined', 'pins', 'density', 'boundary'],
    defaultLens: 'combined',
    layers: ['venues', 'events', 'neighbourhoods'],
    filters: ['category', 'tags', 'time'],
    showCommandBar: true,
    enableSearchThisArea: false,
    enableUrlState: false,
  },
  country: {
    surface: 'country',
    lenses: ['pins', 'boundary'],
    defaultLens: 'boundary',
    layers: ['venues', 'events', 'cities'],
    filters: ['category'],
    showCommandBar: true,
    enableSearchThisArea: false,
    enableUrlState: false,
  },
  trip: {
    surface: 'trip',
    lenses: ['pins', 'routes'],
    defaultLens: 'routes',
    layers: ['venues', 'events'],
    filters: [],
    showCommandBar: false,
    enableSearchThisArea: false,
    enableUrlState: false,
  },
  admin: {
    surface: 'admin',
    lenses: ['combined', 'pins', 'density', 'boundary'],
    defaultLens: 'combined',
    layers: ['venues', 'events', 'hotels'],
    filters: ['category', 'time'],
    showCommandBar: true,
    enableSearchThisArea: true,
    enableUrlState: true,
  },
};
