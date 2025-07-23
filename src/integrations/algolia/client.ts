import algoliasearch from 'algoliasearch';

// Initialize Algolia client with search-only API key for frontend
export const searchClient = algoliasearch(
  'xqeacpakadqfxjxjcewc', // Using project ID as app ID placeholder - will be replaced with actual Algolia app ID
  'search-api-key-placeholder' // Will be replaced with actual search API key
);

// Index names
export const ALGOLIA_INDEXES = {
  TAGS: 'tags',
  TAG_RELATIONSHIPS: 'tag_relationships'
} as const;

export type AlgoliaIndex = typeof ALGOLIA_INDEXES[keyof typeof ALGOLIA_INDEXES];