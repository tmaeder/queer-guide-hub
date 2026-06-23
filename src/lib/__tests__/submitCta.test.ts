import { describe, it, expect } from 'vitest';
import { getSubmitCta } from '../submitCta';

// Identity translator: returns the fallback (the production English copy).
const t = ((_k: string, fallback?: string) => fallback ?? _k) as never;

describe('getSubmitCta', () => {
  it('maps content routes to the matching submit form', () => {
    expect(getSubmitCta('/events', t).route).toBe('/submit/event');
    expect(getSubmitCta('/venues/the-bar', t).route).toBe('/submit/venue');
    expect(getSubmitCta('/marketplace', t).route).toBe('/submit/product');
    expect(getSubmitCta('/hotels/x', t).route).toBe('/submit/hotel');
  });

  it('falls back to the generic hub elsewhere', () => {
    expect(getSubmitCta('/', t).route).toBe('/submit');
    expect(getSubmitCta('/community', t).route).toBe('/submit');
  });

  it('is locale-agnostic', () => {
    expect(getSubmitCta('/de/events', t).route).toBe('/submit/event');
    expect(getSubmitCta('/fr/venues', t).route).toBe('/submit/venue');
  });

  it('returns a label', () => {
    expect(getSubmitCta('/events', t).label).toBe('Submit Event');
    expect(getSubmitCta('/', t).label).toBe('Contribute');
  });
});
