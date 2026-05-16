import { describe, it, expect } from 'vitest';
import { getOutboundLink, sourceDisplayLabel, sourceProvenanceLine, trustPillsFor, linkHealthState } from '../marketplaceHelpers';

const listing = {
  id: 'l1',
  source_type: 'awin',
  external_url: 'https://example.com',
  link_health: 'ok',
  last_link_checked_at: new Date().toISOString(),
} as never;

describe('marketplaceHelpers', () => {
  it('getOutboundLink returns object or null', () => {
    const link = getOutboundLink(listing);
    expect(link === null || typeof link === 'object').toBe(true);
  });
  it('sourceDisplayLabel returns string or null', () => {
    expect(typeof sourceDisplayLabel('awin') === 'string' || sourceDisplayLabel('awin') === null).toBe(true);
  });
  it('sourceProvenanceLine returns string or null', () => {
    const out = sourceProvenanceLine(listing);
    expect(out === null || typeof out === 'string').toBe(true);
  });
  it('trustPillsFor returns array', () => {
    expect(Array.isArray(trustPillsFor(listing))).toBe(true);
  });
  it('linkHealthState returns known state', () => {
    expect(['ok', 'stale', 'broken', 'unknown']).toContain(linkHealthState(listing));
  });
});
