import { describe, it, expect } from 'vitest';
import { routeStationName } from '../routeJourney';

describe('routeStationName', () => {
  it('names the sign-in page as a reader would, not by its URL word', () => {
    expect(routeStationName('/auth')).toBe('Sign in');
    expect(routeStationName('/de/auth')).toBe('Sign in');
  });
  it('keeps every other segment as written', () => {
    expect(routeStationName('/search')).toBe('search');
    expect(routeStationName('/meet/dating')).toBe('meet');
    expect(routeStationName('/')).toBe('queer.guide');
  });
});
