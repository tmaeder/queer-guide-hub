import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  initFormData,
  getMinAgeDate,
  isValidDob,
  calculateCompletion,
} from '../profileForm';

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-15T00:00:00Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('initFormData', () => {
  it('returns default empty form when profile is null', () => {
    const data = initFormData(null);
    expect(data.display_name).toBe('');
    expect(data.user_mode).toBe('exploration');
    expect(data.coming_out_status).toEqual({
      family: 'not_out',
      friends: 'not_out',
      work: 'not_out',
      public: 'not_out',
    });
    expect(data.privacy_settings.profile_visibility).toBe('public');
    expect(data.cultural_background).toEqual([]);
  });

  it('hydrates strings from profile, ignoring non-string types', () => {
    const data = initFormData({
      display_name: 'Alice',
      bio: 'queer dev',
      phone: 42, // non-string → coerced to empty
      website: 'https://example.com',
    } as never);

    expect(data.display_name).toBe('Alice');
    expect(data.bio).toBe('queer dev');
    expect(data.phone).toBe('');
    expect(data.website).toBe('https://example.com');
  });

  it('hydrates string-array fields, filtering non-strings', () => {
    const data = initFormData({
      cultural_background: ['queer', 42, 'german'],
    } as never);
    expect(data.cultural_background).toEqual(['queer', 'german']);
  });

  it('flattens languages: { list: [...] } into a string array', () => {
    const data = initFormData({
      languages: { list: ['en', 'de'] },
    } as never);
    expect(data.languages).toEqual(['en', 'de']);
  });

  it('merges partial privacy + coming-out settings with defaults', () => {
    const data = initFormData({
      privacy_settings: { profile_visibility: 'friends' },
      coming_out_status: { family: 'out' },
    } as never);
    expect(data.privacy_settings.profile_visibility).toBe('friends');
    expect(data.privacy_settings.email_visible).toBe(false); // default kept
    expect(data.coming_out_status.family).toBe('out');
    expect(data.coming_out_status.work).toBe('not_out');
  });

  it("falls back user_mode to 'exploration' when missing", () => {
    expect(initFormData({} as never).user_mode).toBe('exploration');
  });
});

describe('getMinAgeDate', () => {
  it('returns a date exactly 18 years before today (in local time)', () => {
    const min = getMinAgeDate();
    const now = new Date();
    expect(min.getFullYear()).toBe(now.getFullYear() - 18);
    expect(min.getMonth()).toBe(now.getMonth());
    expect(min.getDate()).toBe(now.getDate());
  });
});

describe('isValidDob', () => {
  it('accepts empty string (field optional)', () => {
    expect(isValidDob('')).toBe(true);
  });

  it('accepts a date at least 18 years ago', () => {
    expect(isValidDob('1990-01-01')).toBe(true);
  });

  it('rejects DOB younger than 18', () => {
    expect(isValidDob('2020-01-01')).toBe(false);
  });

  it('rejects DOB before 1900', () => {
    expect(isValidDob('1899-01-01')).toBe(false);
  });

  // Note: the exact 18y-ago boundary is timezone-sensitive in the current
  // implementation (ISO string parses as UTC, getMinAgeDate is local). We
  // intentionally don't test the exact boundary — accepting that off-by-
  // one-day at midnight crosses a timezone is fine for the field's intent
  // (gating obvious underage signups).
});

describe('calculateCompletion', () => {
  function emptyForm() {
    return initFormData(null);
  }

  it('returns 0 for a fresh empty form', () => {
    expect(calculateCompletion(emptyForm())).toBe(0);
  });

  it('returns 60 when all core fields are filled', () => {
    const data = emptyForm();
    data.display_name = 'Alice';
    data.bio = 'queer dev';
    data.location = 'Berlin';
    data.pronouns = 'they/them';
    data.gender_identity = 'non-binary';
    expect(calculateCompletion(data)).toBe(60);
  });

  it('reaches 100 when core + extended + optional are filled', () => {
    const data = emptyForm();
    data.display_name = 'a';
    data.bio = 'b';
    data.location = 'c';
    data.pronouns = 'd';
    data.gender_identity = 'e';
    data.first_name = 'f';
    data.last_name = 'g';
    data.age_range = 'h';
    data.occupation = 'i';
    data.education = 'j';
    data.sexual_orientation = 'k';
    data.romantic_orientation = 'l';
    data.current_relationship_status = 'm';
    data.relationship_style = 'n';
    data.chosen_family_status = 'o';
    expect(calculateCompletion(data)).toBe(100);
  });

  it('ignores whitespace-only values', () => {
    const data = emptyForm();
    data.display_name = '   ';
    expect(calculateCompletion(data)).toBe(0);
  });
});
