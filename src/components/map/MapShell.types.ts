import type { LayerType, ExploreMapFilters } from '@/hooks/useExploreMapData';

export type MapSurface = 'discover' | 'search' | 'city' | 'country' | 'trip' | 'admin';

export type MapLens = 'pins' | 'density' | 'routes' | 'boundary';

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
  nearMe?: { lat: number; lng: number; radiusKm: number };
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
};

export const SURFACE_PRESETS: Record<MapSurface, MapShellConfig> = {
  discover: {
    surface: 'discover',
    lenses: ['pins', 'density', 'boundary'],
    defaultLens: 'pins',
    layers: ['venues', 'events', 'hotels', 'restrooms', 'neighbourhoods', 'cities', 'countries'],
    filters: ['category', 'tags', 'near-me', 'time', 'queer-owned', 'era'],
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
    lenses: ['pins', 'density', 'boundary'],
    defaultLens: 'pins',
    layers: ['venues', 'events', 'neighbourhoods'],
    filters: ['category', 'time'],
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
    lenses: ['pins', 'density', 'boundary'],
    defaultLens: 'density',
    layers: ['venues', 'events', 'hotels'],
    filters: ['category', 'time'],
    showCommandBar: true,
    enableSearchThisArea: true,
    enableUrlState: true,
  },
};
