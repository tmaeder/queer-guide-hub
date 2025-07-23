import { algoliasearch } from 'algoliasearch';

// Initialize Algolia client with search-only API key for frontend
// These will be replaced with actual Algolia credentials from secrets
export const searchClient = algoliasearch(
  'placeholder-app-id', // Will be replaced with actual Algolia app ID
  'placeholder-search-key' // Will be replaced with actual search API key
);

// Index names
export const ALGOLIA_INDEXES = {
  TAGS: 'tags',
  TAG_RELATIONSHIPS: 'tag_relationships'
} as const;

export type AlgoliaIndex = typeof ALGOLIA_INDEXES[keyof typeof ALGOLIA_INDEXES];