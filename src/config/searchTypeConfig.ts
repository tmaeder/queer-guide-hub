/**
 * Per-content-type configuration for the /search results page: which views,
 * sort options, and filter sections each scope exposes, plus a smart default
 * view. One source of truth so SearchResults, SearchFiltersPanel, and the
 * controls bar all agree. Keyed by scope id ('all' = no type filter); unknown
 * scopes fall back to 'all'.
 *
 * Sort ids map 1:1 to the worker's p_sort (server-side, correct across
 * pagination) except 'relevance' (omit p_sort) and 'distance' (only meaningful
 * with a geo filter — gate at render).
 */
import type { ComponentType } from 'react';
import {
  List,
  Grid,
  MapPin,
  CalendarDays,
  TrendingUp,
  Navigation,
  Clock,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

export type SearchViewMode = 'list' | 'grid' | 'map' | 'calendar';
export type SearchSortId =
  | 'relevance'
  | 'distance'
  | 'date_asc'
  | 'date_desc'
  | 'price_asc'
  | 'price_desc';
export type SearchFilterKey =
  | 'category'
  | 'targetGroups'
  | 'date'
  | 'price'
  | 'free'
  | 'featured'
  | 'geo';

export interface SearchTypeConfig {
  views: SearchViewMode[];
  defaultView: SearchViewMode;
  sorts: SearchSortId[];
  filters: SearchFilterKey[];
}

export const VIEW_META: Record<
  SearchViewMode,
  { Icon: ComponentType<{ className?: string }>; labelKey: string; label: string }
> = {
  list: { Icon: List, labelKey: 'search.view.list', label: 'List view' },
  grid: { Icon: Grid, labelKey: 'search.view.grid', label: 'Grid view' },
  map: { Icon: MapPin, labelKey: 'search.view.map', label: 'Map view' },
  calendar: { Icon: CalendarDays, labelKey: 'search.view.calendar', label: 'Calendar view' },
};

export const SORT_META: Record<
  SearchSortId,
  { Icon: ComponentType<{ className?: string }>; labelKey: string; label: string }
> = {
  relevance: { Icon: TrendingUp, labelKey: 'search.sort.relevance', label: 'Relevance' },
  distance: { Icon: Navigation, labelKey: 'search.sort.distance', label: 'Distance' },
  date_asc: { Icon: Clock, labelKey: 'search.sort.soonest', label: 'Soonest' },
  date_desc: { Icon: Clock, labelKey: 'search.sort.latest', label: 'Latest' },
  price_asc: { Icon: ArrowUp, labelKey: 'search.sort.priceLow', label: 'Price: Low to High' },
  price_desc: { Icon: ArrowDown, labelKey: 'search.sort.priceHigh', label: 'Price: High to Low' },
};

/** Worker p_sort value for a SearchSortId, or undefined for the relevance default. */
export function workerSort(sort: SearchSortId | undefined): string | undefined {
  return sort && sort !== 'relevance' ? sort : undefined;
}

const ALL: SearchTypeConfig = {
  views: ['list', 'grid', 'map'],
  defaultView: 'list',
  sorts: ['relevance', 'distance'],
  filters: ['category', 'targetGroups', 'geo'],
};

export const SEARCH_TYPE_CONFIG: Record<string, SearchTypeConfig> = {
  all: ALL,
  venue: {
    views: ['list', 'grid', 'map'],
    defaultView: 'list',
    sorts: ['relevance', 'distance'],
    filters: ['category', 'targetGroups', 'geo', 'featured'],
  },
  event: {
    views: ['list', 'grid', 'calendar', 'map'],
    defaultView: 'calendar',
    sorts: ['relevance', 'date_asc', 'date_desc', 'distance'],
    filters: ['date', 'price', 'free', 'targetGroups', 'category', 'geo'],
  },
  marketplace: {
    views: ['grid', 'list'],
    defaultView: 'grid',
    sorts: ['relevance', 'price_asc', 'price_desc'],
    filters: ['price', 'free', 'category'],
  },
  news: {
    views: ['list', 'grid'],
    defaultView: 'list',
    sorts: ['relevance', 'date_desc', 'date_asc'],
    filters: ['category', 'date'],
  },
  personality: {
    views: ['list', 'grid'],
    defaultView: 'list',
    sorts: ['relevance'],
    filters: ['category'],
  },
  city: {
    views: ['list', 'map'],
    defaultView: 'map',
    sorts: ['relevance', 'distance'],
    filters: ['geo'],
  },
  country: {
    views: ['list', 'map'],
    defaultView: 'map',
    sorts: ['relevance', 'distance'],
    filters: ['geo'],
  },
  tag: {
    views: ['list', 'grid'],
    defaultView: 'list',
    sorts: ['relevance'],
    filters: ['category'],
  },
  queer_village: {
    views: ['list', 'grid', 'map'],
    defaultView: 'list',
    sorts: ['relevance', 'distance'],
    filters: ['category', 'targetGroups', 'geo'],
  },
};

export function getTypeConfig(scope: string | null | undefined): SearchTypeConfig {
  return (scope && SEARCH_TYPE_CONFIG[scope]) || ALL;
}
