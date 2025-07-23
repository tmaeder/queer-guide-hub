// Simple, robust Algolia client configuration
export const ALGOLIA_CONFIG = {
  APP_ID: 'placeholder-app-id',
  SEARCH_KEY: 'placeholder-search-key',
  ADMIN_KEY: 'placeholder-admin-key', // Only used in edge functions
};

// Index configuration
export const ALGOLIA_INDEXES = {
  TAGS: 'tags',
  VENUES: 'venues', 
  EVENTS: 'events',
  MARKETPLACE: 'marketplace',
  COMMUNITY: 'community',
  COUNTRIES: 'countries',
  CITIES: 'cities',
  NEWS: 'news'
} as const;

export type AlgoliaIndexName = typeof ALGOLIA_INDEXES[keyof typeof ALGOLIA_INDEXES];

// Simple search interface (no complex client initialization)
export interface AlgoliaSearchResult {
  objectID: string;
  [key: string]: any;
}

export interface AlgoliaSearchResponse {
  hits: AlgoliaSearchResult[];
  nbHits: number;
  page: number;
  nbPages: number;
}