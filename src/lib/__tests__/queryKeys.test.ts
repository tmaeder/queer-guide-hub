import { describe, it, expect } from 'vitest';
import { qk, type TripFacet } from '../queryKeys';

const isPrefixOf = (prefix: readonly unknown[], key: readonly unknown[]) =>
  prefix.length <= key.length && prefix.every((seg, i) => Object.is(seg, key[i]));

const ALL_FACETS: TripFacet[] = [
  'booking-clicks',
  'budget',
  'budget-items',
  'chat',
  'comments',
  'concierge',
  'cost-estimate',
  'email-turns',
  'inbox',
  'inbox-items',
  'journal',
  'local-context',
  'messages',
  'news',
  'notes',
  'nudges',
  'packing',
  'packing-suggestions',
  'photos',
  'polls',
  'reactions',
  'recap',
  'reservation-suggestions',
  'reservations',
  'safety-briefing',
  'safety-narrative',
  'share-view-stats',
  'shares',
];

describe('trip query keys', () => {
  it('makes detail(id) a prefix of EVERY facet — the whole point of the factory', () => {
    // TanStack matches by prefix. The 46 flat `trip-*` roots this replaced were
    // siblings, so `invalidateQueries(['trip', id])` reached none of them and
    // every mutation left its own trip's sub-resources stale. Nesting means a
    // facet added tomorrow is invalidated by call sites written today.
    const detail = qk.trip.detail('t1');
    for (const facet of ALL_FACETS) {
      expect(
        isPrefixOf(detail, qk.trip.facet('t1', facet)),
        `facet "${facet}" is not reached by invalidating the trip`,
      ).toBe(true);
    }
  });

  it('scopes facets to their own trip', () => {
    expect(isPrefixOf(qk.trip.detail('t1'), qk.trip.facet('t2', 'packing'))).toBe(false);
  });

  it('makes all() reach both lists and details', () => {
    expect(isPrefixOf(qk.trip.all(), qk.trip.list('u1'))).toBe(true);
    expect(isPrefixOf(qk.trip.all(), qk.trip.detail('t1'))).toBe(true);
    expect(isPrefixOf(qk.trip.all(), qk.trip.facet('t1', 'notes'))).toBe(true);
  });

  it('keeps lists and details from invalidating each other', () => {
    // Editing a trip should not blow away the user's trip list query and
    // vice versa; they are separate branches under all().
    expect(isPrefixOf(qk.trip.lists(), qk.trip.detail('t1'))).toBe(false);
    expect(isPrefixOf(qk.trip.details(), qk.trip.list('u1'))).toBe(false);
  });

  it('normalizes null and undefined to one cache entry', () => {
    // Two spellings of "no user" previously produced two caches, so a signed-out
    // read and a not-yet-loaded read never shared a result.
    expect(qk.trip.list(null)).toEqual(qk.trip.list(undefined));
    expect(qk.trip.detail(null)).toEqual(qk.trip.detail(undefined));
    expect(qk.trip.savesFor(null)).toEqual(qk.trip.savesFor(undefined));
  });

  it('keeps city-keyed map suggestions OUT of the trip subtree', () => {
    // Map pins are shared by every trip through those cities and must survive
    // an unrelated edit to any one of them.
    expect(isPrefixOf(qk.trip.detail('t1'), qk.trip.mapSuggestions('venues', ['c1']))).toBe(false);
    expect(isPrefixOf(qk.trip.details(), qk.trip.mapSuggestions('events', ['c1']))).toBe(false);
  });

  it('still reaches per-viewer and city-dependent facets from the trip', () => {
    expect(isPrefixOf(qk.trip.detail('t1'), qk.trip.reactions('t1', 'u1'))).toBe(true);
    expect(isPrefixOf(qk.trip.detail('t1'), qk.trip.localContext('t1', ['c1']))).toBe(true);
  });

  it('gives distinct args distinct keys', () => {
    expect(qk.trip.facet('t1', 'packing')).not.toEqual(qk.trip.facet('t1', 'notes'));
    expect(qk.trip.list('u1')).not.toEqual(qk.trip.list('u2'));
    expect(qk.trip.suggestions('cities', ['c1'])).not.toEqual(
      qk.trip.suggestions('venues', ['c1']),
    );
  });
});
