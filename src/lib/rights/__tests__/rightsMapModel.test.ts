import { describe, it, expect } from 'vitest';
import {
  mapClassFor,
  summariseMapClasses,
  MAP_CLASS_ORDER,
  type MapClass,
} from '../rightsMapModel';
import { topicBySlug } from '../rightsCatalog';

/**
 * `mapClassFor` must never disagree with `classifyCountryRight`
 * (rightsClassify.test.ts pins that reader's own behaviour) — this file only
 * pins the extra step: the `StatusKind` → `MapClass` rename and the
 * criminalisation-only death-penalty split.
 */

const crimTopic = topicBySlug('criminalisation')!;
const employmentTopic = topicBySlug('employment')!;
const expressionTopic = topicBySlug('expression')!;

const crimRow = (legal: boolean, deathPenalty?: string, penalty?: string) => ({
  lgbti_criminalization: {
    legal,
    ...(deathPenalty !== undefined ? { death_penalty: deathPenalty } : {}),
    ...(penalty !== undefined ? { penalty } : {}),
  },
});

describe('mapClassFor — criminalisation death-penalty split', () => {
  it('reads a confirmed death penalty as death', () => {
    expect(mapClassFor(crimRow(false, 'Yes'), crimTopic)).toBe('death');
  });

  it('reads "No legal certainty" as deathPossible, never confirmed and never silent', () => {
    const row = crimRow(false, 'No legal certainty');
    const cls = mapClassFor(row, crimTopic);
    expect(cls).toBe('deathPossible');
    expect(cls).not.toBe('death');
    expect(cls).not.toBe('nodata');
  });

  it('reads a criminalising country with no death signal as criminalised', () => {
    expect(mapClassFor(crimRow(false), crimTopic)).toBe('criminalised');
  });

  it('reads a decriminalised country as protected', () => {
    expect(mapClassFor(crimRow(true), crimTopic)).toBe('protected');
  });

  it('reads an unmeasured criminalisation column as nodata, not a default', () => {
    expect(mapClassFor({}, crimTopic)).toBe('nodata');
    expect(mapClassFor({ lgbti_criminalization: {} }, crimTopic)).toBe('nodata');
  });
});

describe('mapClassFor — non-criminalisation severe stays criminalised, never split', () => {
  it('does not apply the death-penalty split outside the criminalisation topic', () => {
    // "Explicit legal barriers" reads `severe` on rightsValue's vocab; this
    // topic has no death_penalty concept at all, so it must land on the
    // plain `criminalised` class regardless of what garbage a caller passes.
    const row = { lgbti_expression_restrictions: { summary: 'Explicit Legal Barriers' } };
    expect(mapClassFor(row, expressionTopic)).toBe('criminalised');
  });
});

describe('mapClassFor — protection-matrix topics', () => {
  const row = (so: string, gi: string, ge: string, sc: string) => ({
    lgbti_employment_protection: { so, gi, ge, sc },
  });

  it('classifies protected only when every declared attribute reads Yes', () => {
    expect(mapClassFor(row('Yes', 'Yes', 'Yes', 'Yes'), employmentTopic)).toBe('protected');
  });

  it('classifies partial when some but not all read Yes', () => {
    expect(mapClassFor(row('Yes', 'No', 'No', 'No'), employmentTopic)).toBe('partial');
  });

  it('classifies restricted when the country has a reading but none are Yes', () => {
    expect(mapClassFor(row('No', 'No', 'No', 'No'), employmentTopic)).toBe('restricted');
  });

  it('classifies nodata when every attribute is "No data"', () => {
    expect(mapClassFor(row('No data', 'No data', 'No data', 'No data'), employmentTopic)).toBe(
      'nodata',
    );
  });

  it('never produces nodata for a country with a real reading', () => {
    const measured = ['protected', 'partial', 'restricted'];
    expect(measured).toContain(mapClassFor(row('Yes', 'No', 'No data', 'No'), employmentTopic));
  });

  it('the trans lens flips a sexual-orientation-only country from protected to restricted', () => {
    const soOnly = row('Yes', 'No', 'No', 'No');
    expect(mapClassFor(soOnly, employmentTopic, 'all')).toBe('partial');
    expect(mapClassFor(soOnly, employmentTopic, 'so')).toBe('protected');
    expect(mapClassFor(soOnly, employmentTopic, 'gi')).toBe('restricted');
  });

  it('a lens naming an attribute never asked of this column reads nodata, not restricted', () => {
    const noGiReading = row('Yes', 'No data', 'No data', 'No data');
    expect(mapClassFor(noGiReading, employmentTopic, 'gi')).toBe('nodata');
  });
});

describe('summariseMapClasses', () => {
  const countries = [
    crimRow(true), // protected
    crimRow(false, 'Yes'), // death
    crimRow(false, 'No legal certainty'), // deathPossible
    crimRow(false), // criminalised
    {}, // nodata
  ];

  it('totals equal the country count', () => {
    const counts = summariseMapClasses(countries, crimTopic);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(countries.length);
  });

  it('buckets each country into the class mapClassFor would produce for it', () => {
    const counts = summariseMapClasses(countries, crimTopic);
    expect(counts.protected).toBe(1);
    expect(counts.death).toBe(1);
    expect(counts.deathPossible).toBe(1);
    expect(counts.criminalised).toBe(1);
    expect(counts.nodata).toBe(1);
  });
});

describe('MAP_CLASS_ORDER', () => {
  it('covers every MapClass exactly once', () => {
    const all: MapClass[] = [
      'protected',
      'partial',
      'restricted',
      'criminalised',
      'death',
      'deathPossible',
      'nodata',
    ];
    expect([...MAP_CLASS_ORDER].sort()).toEqual([...all].sort());
    expect(new Set(MAP_CLASS_ORDER).size).toBe(MAP_CLASS_ORDER.length);
  });

  it('runs nodata last, off the restrictive→protective continuum', () => {
    expect(MAP_CLASS_ORDER[MAP_CLASS_ORDER.length - 1]).toBe('nodata');
  });
});
