import { describe, expect, it } from 'vitest';
import {
  birthEra,
  eraOptions,
  filterProfessionPeople,
  nationalityOptions,
} from '../professionPeople';

const people = [
  { id: '1', name: 'Ginger Minj', nationality: 'United States', birth_date: '1984-09-11' },
  { id: '2', name: 'Bimini Bon-Boulash', nationality: 'United Kingdom', birth_date: '1986-01-01' },
  { id: '3', name: 'Divine', nationality: 'United States', birth_date: '1945-10-19' },
  { id: '4', name: 'Jöse', nationality: null, birth_date: null },
];

describe('filterProfessionPeople', () => {
  it('matches names case- and accent-insensitively', () => {
    expect(filterProfessionPeople(people, { query: 'GINGER' }).map((p) => p.id)).toEqual(['1']);
    expect(filterProfessionPeople(people, { query: 'jose' }).map((p) => p.id)).toEqual(['4']);
  });

  it('combines nationality and era', () => {
    expect(
      filterProfessionPeople(people, { nationality: 'United States', era: '1980s' }).map(
        (p) => p.id,
      ),
    ).toEqual(['1']);
    expect(filterProfessionPeople(people, {}).length).toBe(4);
  });
});

describe('options', () => {
  it('lists nationalities by frequency, eras in order, only when they split the list', () => {
    expect(nationalityOptions(people)).toEqual(['United States', 'United Kingdom']);
    expect(eraOptions(people)).toEqual(['1900s', '1980s']);
    expect(nationalityOptions([people[0]])).toEqual([]);
  });

  it('reads the birth era from the year', () => {
    expect(birthEra('1899-12-31')).toBe('pre1900');
    expect(birthEra('1950-01-01')).toBe('1950s');
    expect(birthEra(null)).toBeNull();
  });
});
