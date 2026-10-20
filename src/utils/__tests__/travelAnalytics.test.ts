import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackTravelEvent } from '../travelAnalytics';

describe('trackTravelEvent', () => {
  const mockTrack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(
      'queer-guide-cookie-consent',
      JSON.stringify({ version: '1.0', preferences: { analytics: true } }),
    );
    (window as unknown as Record<string, unknown>).umami = { track: mockTrack };
  });

  afterEach(() => {
    localStorage.clear();
    delete (window as unknown as Record<string, unknown>).umami;
  });

  it('should call umami.track with prefixed event name', () => {
    trackTravelEvent('search_submitted');
    expect(mockTrack).toHaveBeenCalledWith('travel_search_submitted', {});
  });

  it('should stringify data values for umami', () => {
    trackTravelEvent('booking_click', { price: 299, airline: 'Swiss' });
    expect(mockTrack).toHaveBeenCalledWith('travel_booking_click', {
      price: '299',
      airline: 'Swiss',
    });
  });

  it('should omit null and undefined values', () => {
    trackTravelEvent('results_loaded', { count: 5, error: null, extra: undefined });
    expect(mockTrack).toHaveBeenCalledWith('travel_results_loaded', { count: '5' });
  });

  it('should handle boolean values', () => {
    trackTravelEvent('origin_detected', { cached: true });
    expect(mockTrack).toHaveBeenCalledWith('travel_origin_detected', { cached: 'true' });
  });

  it('should not throw when umami is not available', () => {
    delete (window as unknown as Record<string, unknown>).umami;
    expect(() => trackTravelEvent('origin_failed')).not.toThrow();
  });

  it('should not throw when umami.track is undefined', () => {
    (window as unknown as Record<string, unknown>).umami = {};
    expect(() => trackTravelEvent('url_generation_failure')).not.toThrow();
  });

  it('should not throw when data is undefined', () => {
    expect(() => trackTravelEvent('search_submitted')).not.toThrow();
    expect(mockTrack).toHaveBeenCalledWith('travel_search_submitted', {});
  });

  it('should never throw even on internal error', () => {
    mockTrack.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => trackTravelEvent('booking_click', { id: '1' })).not.toThrow();
  });
});
