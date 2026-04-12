import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackTravelEvent } from '../travelAnalytics';

describe('trackTravelEvent', () => {
  const mockTrack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).umami = { track: mockTrack };
  });

  afterEach(() => {
    delete (window as any).umami;
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
    delete (window as any).umami;
    expect(() => trackTravelEvent('origin_failed')).not.toThrow();
  });

  it('should not throw when umami.track is undefined', () => {
    (window as any).umami = {};
    expect(() => trackTravelEvent('url_generation_failure')).not.toThrow();
  });

  it('should not throw when data is undefined', () => {
    expect(() => trackTravelEvent('search_submitted')).not.toThrow();
    expect(mockTrack).toHaveBeenCalledWith('travel_search_submitted', {});
  });

  it('should never throw even on internal error', () => {
    mockTrack.mockImplementation(() => { throw new Error('boom'); });
    expect(() => trackTravelEvent('booking_click', { id: '1' })).not.toThrow();
  });
});
