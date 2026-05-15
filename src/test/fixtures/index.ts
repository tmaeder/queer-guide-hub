/**
 * Shared test fixtures. Keep these minimal and override only the fields
 * a given test actually cares about — `{ ...fixtureVenue, name: 'X' }`.
 *
 * Fields mirror the DB schema (see src/integrations/supabase/types.ts).
 * Only the columns used by frontend code are populated.
 */

export const fixtureVenue = {
  id: 'venue_1',
  name: 'Test Venue',
  slug: 'test-venue',
  description: 'A test venue.',
  address: '1 Test St',
  city_id: 'city_1',
  country_id: 'country_1',
  latitude: 52.52,
  longitude: 13.405,
  is_featured: false,
  status: 'published',
  category: 'bar',
  image_url: null,
  website: 'https://example.com',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as const;

export const fixtureEvent = {
  id: 'event_1',
  title: 'Test Event',
  slug: 'test-event',
  description: 'A test event.',
  start_date: '2026-06-01T18:00:00Z',
  end_date: '2026-06-01T22:00:00Z',
  city_id: 'city_1',
  country_id: 'country_1',
  venue_id: 'venue_1',
  is_featured: false,
  status: 'published',
  image_url: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as const;

export const fixtureCity = {
  id: 'city_1',
  name: 'Berlin',
  slug: 'berlin',
  country_id: 'country_1',
  latitude: 52.52,
  longitude: 13.405,
  is_featured: true,
  created_at: '2026-01-01T00:00:00Z',
} as const;

export const fixtureCountry = {
  id: 'country_1',
  name: 'Germany',
  code: 'DE',
  slug: 'germany',
  is_featured: true,
  created_at: '2026-01-01T00:00:00Z',
} as const;

export const fixtureNewsArticle = {
  id: 'news_1',
  title: 'Test Article',
  slug: 'test-article',
  summary: 'A test article.',
  content: 'Full content.',
  published_at: '2026-01-01T00:00:00Z',
  source_id: 'src_1',
  url: 'https://example.com/article',
  image_url: null,
  status: 'published',
  fingerprint: 'abc123',
  created_at: '2026-01-01T00:00:00Z',
} as const;

export const fixtureUser = {
  id: 'user_1',
  email: 'test@queer.guide',
  username: 'tester',
  display_name: 'Tester',
  avatar_url: null,
  created_at: '2026-01-01T00:00:00Z',
} as const;

export const fixturePersonality = {
  id: 'p_1',
  name: 'Test Person',
  slug: 'test-person',
  bio: 'A test bio.',
  profession: 'activist',
  lgbti_connection: 'lesbian',
  birth_date: '1980-01-01',
  death_date: null,
  is_featured: false,
  status: 'published',
  image_url: null,
  created_at: '2026-01-01T00:00:00Z',
} as const;
