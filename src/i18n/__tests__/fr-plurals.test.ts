import { describe, it, expect, beforeAll } from 'vitest';
import i18n from '@/i18n';

beforeAll(async () => {
  await i18n.changeLanguage('fr');
}, 30000);

describe('French pluralization', () => {
  it.each([
    ['trips.card.placeCount', 0, '0 lieux'],
    ['trips.card.placeCount', 1, '1 lieu'],
    ['trips.card.placeCount', 2, '2 lieux'],
    ['trips.planner.placesCount', 0, '0 lieux'],
    ['trips.planner.placesCount', 1, '1 lieu'],
    ['trips.planner.placesCount', 2, '2 lieux'],
    ['trips.card.dayCount', 0, '0 jours'],
    ['trips.card.dayCount', 1, '1 jour'],
    ['trips.card.dayCount', 2, '2 jours'],
    ['trips.safety.stops', 0, '0 étapes'],
    ['trips.safety.stops', 1, '1 étape'],
    ['trips.safety.stops', 2, '2 étapes'],
  ])('%s with count=%i → %s', (key, count, expected) => {
    expect(i18n.t(key, { count, lng: 'fr' })).toBe(expected);
  });
});
