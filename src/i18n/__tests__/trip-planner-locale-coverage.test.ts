import { describe, it, expect } from 'vitest';
import en from '../locales/en.json';
import de from '../locales/de.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import itLocale from '../locales/it.json';
import pt from '../locales/pt.json';
import ru from '../locales/ru.json';
import zh from '../locales/zh.json';
import ja from '../locales/ja.json';
import ko from '../locales/ko.json';
import ar from '../locales/ar.json';

/**
 * Keys that must be localized in every supported locale for the trip planner
 * (trip list, active trip banner, trip detail header, search/marketplace UI).
 * Guards against regressions where English leaks into non-English locales.
 */
const REQUIRED_KEYS = [
  'trips.contextBar.openTrip',
  'trips.contextBar.ariaLabel',
  'trips.contextBar.dismissAria',
  'trips.phase.label.seed',
  'trips.phase.label.plan',
  'trips.phase.label.countdown',
  'trips.phase.label.live',
  'trips.phase.label.memory',
  'trips.phase.status.datesNotSet',
  'trips.phase.status.inDays',
  'trips.phase.status.tomorrow',
  'trips.phase.status.dayOf',
  'trips.phase.status.daysAgo',
  'trips.phase.status.yesterday',
  'trips.card.activeToday',
  'trips.discover.title',
  'trips.discover.button',
  'search.placeholders.venues',
  'search.placeholders.events',
  'search.placeholders.marketplace',
  'search.placeholders.people',
  'search.placeholders.news',
  'search.placeholders.resources',
  'search.placeholders.personalities',
];

/**
 * English strings that must NOT appear in non-English locale values for the
 * listed keys. These are the specific leftovers reported in the P1 bug.
 */
const ENGLISH_LEFTOVERS = [
  'Dates not set',
  'Open trip',
  'Browse marketplace',
  'Discover people',
  'Active · Today',
];

type Locale = Record<string, unknown>;

function lookup(obj: Locale, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

const locales: Array<[string, Locale]> = [
  ['en', en as Locale],
  ['de', de as Locale],
  ['es', es as Locale],
  ['fr', fr as Locale],
  ['it', itLocale as Locale],
  ['pt', pt as Locale],
  ['ru', ru as Locale],
  ['zh', zh as Locale],
  ['ja', ja as Locale],
  ['ko', ko as Locale],
  ['ar', ar as Locale],
];

describe('trip planner locale coverage', () => {
  for (const [code, data] of locales) {
    describe(code, () => {
      for (const key of REQUIRED_KEYS) {
        it(`has a translation for ${key}`, () => {
          const value = lookup(data, key);
          expect(typeof value).toBe('string');
          expect((value as string).length).toBeGreaterThan(0);
        });
      }

      if (code !== 'en') {
        it('does not contain English leftovers for these keys', () => {
          for (const key of REQUIRED_KEYS) {
            const value = lookup(data, key);
            if (typeof value !== 'string') continue;
            for (const leftover of ENGLISH_LEFTOVERS) {
              expect(
                value.toLowerCase(),
                `${code}:${key} should not equal English "${leftover}"`,
              ).not.toBe(leftover.toLowerCase());
            }
          }
        });
      }
    });
  }
});
