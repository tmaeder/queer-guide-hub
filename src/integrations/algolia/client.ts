import { algoliasearch } from 'algoliasearch';

// Initialize Algolia client with search-only API key for frontend
// These will be replaced with actual Algolia credentials from secrets
export const searchClient = algoliasearch(
  'placeholder-app-id', // Will be replaced with actual Algolia app ID
  'placeholder-search-key' // Will be replaced with actual search API key
);

// Index names for different content types
export const ALGOLIA_INDEXES = {
  TAGS: 'tags',
  TAG_RELATIONSHIPS: 'tag_relationships',
  VENUES: 'venues',
  EVENTS: 'events',
  MARKETPLACE: 'marketplace_listings',
  COMMUNITY_POSTS: 'community_posts',
  NEWS_ARTICLES: 'news_articles',
  COUNTRIES: 'countries',
  CITIES: 'cities',
  USERS: 'user_profiles'
} as const;

export type AlgoliaIndex = typeof ALGOLIA_INDEXES[keyof typeof ALGOLIA_INDEXES];