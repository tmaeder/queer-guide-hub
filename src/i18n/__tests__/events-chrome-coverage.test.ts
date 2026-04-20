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
 * Guards that the 13 new filter-chrome keys + `common.contentInLanguage`
 * exist in every locale. Regression test for the P1 bug where the Events
 * filter bar leaked hardcoded English into non-English locales.
 */
const REQUIRED_KEYS = [
  'pages.events.filterSearch',
  'pages.events.filterCity',
  'pages.events.filterNearYou',
  'pages.events.filterFrom',
  'pages.events.filterTo',
  'pages.events.filterNearMe',
  'pages.events.clearFilterSearch',
  'pages.events.clearFilterCity',
  'pages.events.clearFilterEventType',
  'pages.events.clearFilterStartDate',
  'pages.events.clearFilterEndDate',
  'pages.events.clearFilterNearMe',
  'pages.events.clearFilterPast',
  'common.contentInLanguage',
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

describe('events filter chrome locale coverage', () => {
  for (const [code, data] of locales) {
    describe(code, () => {
      for (const key of REQUIRED_KEYS) {
        it(`has ${key}`, () => {
          const value = lookup(data, key);
          expect(typeof value).toBe('string');
          expect((value as string).length).toBeGreaterThan(0);
        });
      }

      const VALUE_KEYS = [
        'pages.events.filterSearch',
        'pages.events.filterCity',
        'pages.events.filterNearYou',
        'pages.events.filterFrom',
        'pages.events.filterTo',
      ];
      for (const key of VALUE_KEYS) {
        it(`${key} retains {{value}} placeholder`, () => {
          const value = lookup(data, key) as string;
          expect(value).toMatch(/\{\{\s*value\s*\}\}/);
        });
      }
      it('common.contentInLanguage retains {{lang}} placeholder', () => {
        const value = lookup(data, 'common.contentInLanguage') as string;
        expect(value).toMatch(/\{\{\s*lang\s*\}\}/);
      });
    });
  }
});
