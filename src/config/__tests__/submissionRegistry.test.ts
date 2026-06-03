import { describe, it, expect } from 'vitest';
import {
  submissionRegistry,
  submissionTypes,
  primarySubmissionTypes,
  moreSubmissionTypes,
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
  it('covers the registry except hotel (folded into venue on the hub)', () => {
    const setA = new Set(submissionTypes.map((t) => t.id));
    const setB = new Set(Object.keys(submissionRegistry));
    setB.delete('hotel');
    expect(setA).toEqual(setB);
  });

  it('does not surface hotel as its own hub card', () => {
    expect(submissionTypes.map((t) => t.id)).not.toContain('hotel');
  });

  it('every type declares a group, split into primary + more', () => {
    for (const t of submissionTypes) {
      expect(t.group === 'primary' || t.group === 'more').toBe(true);
    }
    expect(primarySubmissionTypes.map((t) => t.id)).toEqual(['event', 'venue', 'product']);
    expect(moreSubmissionTypes.every((t) => t.group === 'more')).toBe(true);
    expect(primarySubmissionTypes.length + moreSubmissionTypes.length).toBe(submissionTypes.length);
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
