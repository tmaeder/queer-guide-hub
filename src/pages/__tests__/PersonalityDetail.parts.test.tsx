/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';

import { transformPersonality, calculateAge, getInitials } from '../PersonalityDetail.parts';

describe('PersonalityDetail.parts', () => {
  it('transformPersonality returns object', () => {
    expect(typeof transformPersonality({ id: 'p1', name: 'Test' })).toBe('object');
  });
  it('calculateAge handles birth+death', () => {
    expect(typeof calculateAge('1900-01-01', '2000-01-01')).toBe('number');
  });
  it('getInitials returns initials', () => {
    expect(getInitials('John Doe')).toMatch(/J|JD/);
  });
});
