import { describe, it, expect } from 'vitest';
import { isValidTripId, classifyTripError } from '../tripError';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('isValidTripId', () => {
  it('accepts a canonical UUID v4', () => {
    expect(isValidTripId(VALID_UUID)).toBe(true);
  });

  it('accepts upper-case UUIDs', () => {
    expect(isValidTripId(VALID_UUID.toUpperCase())).toBe(true);
  });

  it('rejects null', () => {
    expect(isValidTripId(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidTripId(undefined)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidTripId('')).toBe(false);
  });

  it('rejects garbage strings', () => {
    expect(isValidTripId('not-a-uuid')).toBe(false);
    expect(isValidTripId('123')).toBe(false);
  });

  it('rejects UUIDs with wrong segment lengths', () => {
    expect(isValidTripId('550e8400-e29b-41d4-a716-44665544000')).toBe(false);
  });
});

describe('classifyTripError', () => {
  describe('Invalid IDs', () => {
    it("returns 'invalid-id' when tripId is null", () => {
      expect(classifyTripError(null, null, null)).toBe('invalid-id');
    });

    it("returns 'invalid-id' when tripId is undefined", () => {
      expect(classifyTripError(undefined, null, null)).toBe('invalid-id');
    });

    it("returns 'invalid-id' when tripId is malformed", () => {
      expect(classifyTripError('not-a-uuid', null, null)).toBe('invalid-id');
    });
  });

  describe('PostgREST error codes', () => {
    it("returns 'not-found' for PGRST116 (no rows)", () => {
      expect(
        classifyTripError(VALID_UUID, { code: 'PGRST116' }, null),
      ).toBe('not-found');
    });

    it("returns 'invalid-id' for 22P02 (invalid UUID syntax reached DB)", () => {
      expect(
        classifyTripError(VALID_UUID, { code: '22P02' }, null),
      ).toBe('invalid-id');
    });

    it("returns 'permission-denied' for 42501 (RLS deny)", () => {
      expect(
        classifyTripError(VALID_UUID, { code: '42501' }, null),
      ).toBe('permission-denied');
    });
  });

  describe('HTTP status fallback', () => {
    it("maps status 401 to 'permission-denied'", () => {
      expect(
        classifyTripError(VALID_UUID, { status: 401 }, null),
      ).toBe('permission-denied');
    });

    it("maps status 403 to 'permission-denied'", () => {
      expect(
        classifyTripError(VALID_UUID, { status: 403 }, null),
      ).toBe('permission-denied');
    });

    it("falls back to 'load-error' for unrecognized error shapes", () => {
      expect(
        classifyTripError(VALID_UUID, { code: 'WAT', status: 500 }, null),
      ).toBe('load-error');
    });
  });

  describe('Trip absence', () => {
    it("returns 'not-found' when trip is null and no error", () => {
      expect(classifyTripError(VALID_UUID, null, null)).toBe('not-found');
    });

    it('returns null when trip exists and no error', () => {
      expect(classifyTripError(VALID_UUID, null, { id: VALID_UUID })).toBeNull();
    });
  });
});
