import { describe, it, expect } from 'vitest';
import { resolveHistoricalPlace, type HistoricalNameEntry } from '../historicalPlace';

const berlin: HistoricalNameEntry[] = [
  {
    name_de: 'Ost-Berlin',
    name_en: 'East Berlin',
    country_name_de: 'Deutsche Demokratische Republik',
    country_name_en: 'German Democratic Republic',
    country_code: 'DDR',
    valid_from: '1949-10-07',
    valid_to: '1990-10-03',
    region: 'east',
  },
  {
    name_de: 'West-Berlin',
    name_en: 'West Berlin',
    country_name_de: 'Bundesrepublik Deutschland',
    country_name_en: 'Federal Republic of Germany',
    country_code: 'BRD',
    valid_from: '1949-05-23',
    valid_to: '1990-10-03',
    region: 'west',
  },
  {
    name_de: 'Berlin',
    name_en: 'Berlin',
    country_name_de: 'Deutsches Reich',
    country_name_en: 'German Reich',
    country_code: 'DR',
    valid_from: '1871-01-18',
    valid_to: '1945-05-08',
  },
];

const spb: HistoricalNameEntry[] = [
  {
    name_de: 'Leningrad',
    name_en: 'Leningrad',
    country_name_de: 'Sowjetunion',
    country_name_en: 'Soviet Union',
    country_code: 'USSR',
    valid_from: '1924-01-26',
    valid_to: '1991-09-05',
  },
];

const base = {
  currentName: 'Berlin',
  currentNameDe: 'Berlin',
  currentNameEn: 'Berlin',
  currentCountry: 'Deutschland',
};

describe('resolveHistoricalPlace', () => {
  it('resolves Ost-Berlin in DDR period', () => {
    const r = resolveHistoricalPlace({
      ...base,
      historicalNames: berlin,
      rawPlace: 'Ost-Berlin',
      birthDate: '1955-03-12',
    });
    expect(r).toEqual({
      name: 'Ost-Berlin',
      country: 'Deutsche Demokratische Republik',
      historical: true,
    });
  });

  it('resolves West Berlin in EN', () => {
    const r = resolveHistoricalPlace({
      ...base,
      historicalNames: berlin,
      rawPlace: 'West-Berlin',
      birthDate: '1970-01-01',
      locale: 'en',
    });
    expect(r).toEqual({
      name: 'West Berlin',
      country: 'Federal Republic of Germany',
      historical: true,
    });
  });

  it('falls back to current when raw "Berlin" + 1955 is ambiguous', () => {
    const r = resolveHistoricalPlace({
      ...base,
      historicalNames: berlin,
      rawPlace: 'Berlin',
      birthDate: '1955-03-12',
    });
    // Neither east nor west pickable from "Berlin"; Deutsches Reich is out of range.
    expect(r.historical).toBe(false);
    expect(r.name).toBe('Berlin');
    expect(r.country).toBe('Deutschland');
  });

  it('picks Deutsches Reich for "Berlin" + 1900', () => {
    const r = resolveHistoricalPlace({
      ...base,
      historicalNames: berlin,
      rawPlace: 'Berlin',
      birthDate: '1900-01-01',
    });
    expect(r).toEqual({
      name: 'Berlin',
      country: 'Deutsches Reich',
      historical: true,
    });
  });

  it('uses date-interval fallback when raw text missing', () => {
    const r = resolveHistoricalPlace({
      ...base,
      historicalNames: berlin,
      rawPlace: null,
      birthDate: '1900-01-01',
    });
    expect(r.country).toBe('Deutsches Reich');
    expect(r.historical).toBe(true);
  });

  it('resolves Leningrad even without raw text', () => {
    const r = resolveHistoricalPlace({
      currentName: 'Saint Petersburg',
      currentNameEn: 'Saint Petersburg',
      currentCountry: 'Russia',
      historicalNames: spb,
      rawPlace: null,
      birthDate: '1950-06-01',
      locale: 'en',
    });
    expect(r.name).toBe('Leningrad');
    expect(r.country).toBe('Soviet Union');
  });

  it('returns current city when no historical entries', () => {
    const r = resolveHistoricalPlace({
      ...base,
      historicalNames: [],
      rawPlace: null,
      birthDate: '2000-01-01',
    });
    expect(r).toEqual({ name: 'Berlin', country: 'Deutschland', historical: false });
  });

  it('returns current city when no city id (empty everything)', () => {
    const r = resolveHistoricalPlace({});
    expect(r).toEqual({ name: null, country: null, historical: false });
  });
});
