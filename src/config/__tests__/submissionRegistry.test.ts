import { describe, it, expect } from 'vitest';
import {
  submissionRegistry,
  submissionTypes,
  getSubmissionType,
} from '../submissionRegistry';

describe('submissionRegistry', () => {
  it('exposes every supported content type', () => {
    expect(Object.keys(submissionRegistry).sort()).toEqual([
      'event',
      'feedback',
      'hotel',
      'news',
      'personality',
      'place',
      'product',
      'tag',
      'venue',
    ]);
  });

  it.each(Object.entries(submissionRegistry))(
    '%s config has id matching key, label, steps',
    (key, config) => {
      expect(config.id).toBe(key);
      expect(typeof config.label).toBe('string');
      expect(config.steps.length).toBeGreaterThan(0);
      for (const step of config.steps) {
        expect(typeof step.id).toBe('string');
        expect(Array.isArray(step.fields)).toBe(true);
        expect(step.fields.length).toBeGreaterThan(0);
      }
    },
  );

  it('hotel submission defaults category to hotel and targets venues table', () => {
    const hotel = submissionRegistry.hotel;
    expect(hotel.targetTable).toBe('venues');
    expect(hotel.defaults?.category).toBe('hotel');
  });
});

describe('submissionTypes ordered list', () => {
  it('matches the registry contents (same set, may differ in order)', () => {
    const setA = new Set(submissionTypes.map(t => t.id));
    const setB = new Set(Object.keys(submissionRegistry));
    expect(setA).toEqual(setB);
  });
});

describe('getSubmissionType', () => {
  it('returns the config for a known id', () => {
    expect(getSubmissionType('venue')?.label).toBe('Venue');
  });

  it('returns undefined for unknown id', () => {
    expect(getSubmissionType('unknown')).toBeUndefined();
  });
});
