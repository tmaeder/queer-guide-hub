import { describe, it, expect } from 'vitest';
import { routeTemplate } from '../autoFileError';

describe('routeTemplate', () => {
  it('collapses dynamic slugs to a placeholder (low cardinality)', () => {
    expect(routeTemplate('/venues/blue-bar')).toBe('/venues/:slug');
    expect(routeTemplate('/venues/some-other-club')).toBe('/venues/:slug');
    // Different literal slugs MUST map to the same template — this is what
    // keeps a bot hitting thousands of bad slugs to one feedback row + one LLM call.
    expect(routeTemplate('/venues/blue-bar')).toBe(routeTemplate('/venues/xyz-lounge-2024'));
  });

  it('strips a leading locale prefix', () => {
    expect(routeTemplate('/de/venues/blue-bar')).toBe('/:locale/venues/:slug');
    expect(routeTemplate('/fr/events/pride-2025')).toBe('/:locale/events/:slug');
  });

  it('maps uuids and numeric ids to :id', () => {
    expect(routeTemplate('/user/123/trips')).toBe('/user/:id/trips');
    expect(routeTemplate('/x/550e8400-e29b-41d4-a716-446655440000')).toBe('/x/:id');
  });

  it('keeps short static route words distinguishable', () => {
    expect(routeTemplate('/venues/guides')).toBe('/venues/guides');
    expect(routeTemplate('/settings')).toBe('/settings');
  });

  it('handles root and empty paths', () => {
    expect(routeTemplate('/')).toBe('/');
    expect(routeTemplate('')).toBe('/');
  });
});
