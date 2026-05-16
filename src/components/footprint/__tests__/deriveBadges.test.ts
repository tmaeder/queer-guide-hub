import { describe, it, expect } from 'vitest';
import { deriveBadges, type FootprintStats } from '../deriveBadges';

const base: FootprintStats = {
  countries_visited: 0,
  total_countries: 200,
  cities_visited: 0,
  venues_visited: 0,
  events_visited: 0,
  villages_visited: 0,
  continents_touched: 0,
  pride_events: 0,
};

describe('deriveBadges', () => {
  it('awards none for empty stats and zero trips', () => {
    expect(deriveBadges(base, 0)).toEqual([]);
  });

  it('awards First trip when tripCount >= 1', () => {
    const out = deriveBadges(base, 1);
    expect(out.map((b) => b.id)).toContain('first-trip');
  });

  it('awards 10 cities at exactly 10', () => {
    const out = deriveBadges({ ...base, cities_visited: 10 }, 0);
    expect(out.map((b) => b.id)).toContain('ten-cities');
  });

  it('does not award 10 cities at 9', () => {
    const out = deriveBadges({ ...base, cities_visited: 9 }, 0);
    expect(out.map((b) => b.id)).not.toContain('ten-cities');
  });

  it('awards Pride veteran at 3 pride events', () => {
    expect(deriveBadges({ ...base, pride_events: 3 }, 0).map((b) => b.id)).toContain('pride-veteran');
  });

  it('awards Continental traveler at 3 continents', () => {
    expect(deriveBadges({ ...base, continents_touched: 3 }, 0).map((b) => b.id)).toContain(
      'continental-traveler',
    );
  });

  it('awards Village explorer at >=1 village', () => {
    expect(deriveBadges({ ...base, villages_visited: 1 }, 0).map((b) => b.id)).toContain(
      'village-explorer',
    );
  });

  it('awards Globetrotter at 20 countries', () => {
    expect(deriveBadges({ ...base, countries_visited: 20 }, 0).map((b) => b.id)).toContain(
      'globetrotter',
    );
  });

  it('caps at 6 badges', () => {
    const stats: FootprintStats = {
      countries_visited: 25,
      total_countries: 200,
      cities_visited: 50,
      venues_visited: 100,
      events_visited: 30,
      villages_visited: 5,
      continents_touched: 5,
      pride_events: 10,
    };
    expect(deriveBadges(stats, 5)).toHaveLength(6);
  });
});
