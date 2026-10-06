import { beforeEach, describe, expect, it } from 'vitest';
import {
  TRIP_CAPTURE_STORAGE_KEY,
  TRIP_CAPTURE_TTL_MS,
  clearTripCapture,
  readTripCapture,
  storeTripCapture,
} from '../tripCaptureIntent';

describe('tripCaptureIntent', () => {
  beforeEach(() => sessionStorage.clear());

  it('round-trips a public entity intent', () => {
    const stored = storeTripCapture(
      { kind: 'add_entity', entity: { type: 'venue', id: 'v1', name: 'SchwuZ' } },
      { source: 'search', returnTo: '/search?q=berlin', now: 100 },
    );
    expect(readTripCapture(200)).toEqual(stored);
  });

  it('expires pending intent after 24 hours', () => {
    storeTripCapture(
      { kind: 'open_active_trip' },
      { source: 'header', returnTo: '/travel', now: 100 },
    );
    expect(readTripCapture(100 + TRIP_CAPTURE_TTL_MS + 1)).toBeNull();
    expect(sessionStorage.getItem(TRIP_CAPTURE_STORAGE_KEY)).toBeNull();
  });

  it('clears malformed values safely', () => {
    sessionStorage.setItem(TRIP_CAPTURE_STORAGE_KEY, '{bad');
    expect(readTripCapture()).toBeNull();
    expect(sessionStorage.getItem(TRIP_CAPTURE_STORAGE_KEY)).toBeNull();
  });

  it('can be explicitly cleared', () => {
    storeTripCapture({ kind: 'open_active_trip' }, { source: 'dock', returnTo: '/', now: 100 });
    clearTripCapture();
    expect(readTripCapture()).toBeNull();
  });
});
