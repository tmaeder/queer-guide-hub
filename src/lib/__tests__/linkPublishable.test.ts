import { describe, it, expect } from 'vitest';
import { isPublishableLink, type VenueUrlStatus } from '../linkPublishable';

describe('isPublishableLink', () => {
  // A reader reported "the link on this location does not work" and asked whether
  // link checking was possible. It already existed — `url_status` is set on 12,574
  // venues — but the venue page only consulted it in ONE of the two places a
  // website renders, so a link the checker had already condemned still published.
  it('refuses a confirmed-dead link (404/410)', () => {
    expect(isPublishableLink('broken')).toBe(false);
  });

  it('refuses a URL the SSRF guard would not even fetch', () => {
    // `unsafe` means assertPublicHttpUrl() rejected it — a private/loopback target
    // or a malformed host. The old gate tested `!== 'broken'` only, so these were
    // published. Live example: a venue whose host contains mojibake and can never
    // resolve. On a travel site an outbound link is a place we send someone.
    expect(isPublishableLink('unsafe')).toBe(false);
  });

  it.each([
    ['ok', 'reachable'],
    ['redirect', 'the site moved — 5,410 venues, the most common status'],
    ['timeout', 'link-health calls a network failure transient, explicitly NOT dead'],
    ['blocked', 'the server refused OUR bot UA; a human browser is unaffected'],
    ['unknown', 'not conclusively classified — a 5xx lands here and often recovers'],
  ])('publishes %s (%s)', (status) => {
    expect(isPublishableLink(status as VenueUrlStatus)).toBe(true);
  });

  it('publishes an unchecked link rather than hiding it', () => {
    // Absence of evidence is not evidence of absence: a venue that has never been
    // probed must not be punished for it. Hiding null would hide every new venue.
    expect(isPublishableLink(null)).toBe(true);
    expect(isPublishableLink(undefined)).toBe(true);
  });

  it('gates exactly two statuses and no more', () => {
    // Guard against the tempting over-reach of hiding anything that is not `ok`.
    // That would delete thousands of working links (redirect 5,410 + timeout 2,552
    // + blocked 265 + unknown 297) to suppress 263 bad ones.
    const all: VenueUrlStatus[] = [
      'ok',
      'redirect',
      'broken',
      'blocked',
      'timeout',
      'unknown',
      'unsafe',
    ];
    const refused = all.filter((s) => !isPublishableLink(s));
    expect(refused).toEqual(['broken', 'unsafe']);
  });
});
