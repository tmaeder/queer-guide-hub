import { describe, expect, it } from 'vitest';

import {
  canonicalizeUrl,
  detectPlatform,
  displayHandle,
  isAdultPlatform,
  normalizeHandle,
  normalizeSocialLinks,
} from '../registry';

/**
 * Adult video hosts run several profile namespaces side by side and the same
 * handle in two of them is usually two DIFFERENT people. Measured live:
 *
 *   pornhub.com/model/chris-allen    -> 301 https://www.pornhub.com/users/chris-allen
 *   pornhub.com/pornstar/chris-allen -> 200 (a different, live pornstar page)
 *
 * The registry used to rebuild every pornhub link as `/model/<handle>`, so
 * canonicalizing the 1,682 imported `/pornstar/...` URLs would have silently
 * repointed them at strangers. These tests exist to keep that from regrowing.
 */
describe('adult platform namespaces survive canonicalization', () => {
  const roundTrips = [
    'https://www.pornhub.com/pornstar/chris-allen',
    'https://www.pornhub.com/model/chris-allen',
    'https://www.pornhub.com/users/chris-allen',
    'https://xhamster.com/pornstars/siri-dahl',
    'https://xhamster.com/creators/rico-loko',
    'https://www.xvideos.com/models/pierre-fitch',
    'https://www.xvideos.com/profiles/scott-williams',
    // Percent-encoded apostrophe — 3 imported rows look like this and both
    // URLs were verified live (200). A `[a-z0-9._-]` handle charset drops them.
    "https://www.pornhub.com/pornstar/johnson-o%27grady",
  ];

  it.each(roundTrips)('%s canonicalizes to itself', (url) => {
    const key = detectPlatform(url);
    expect(key).not.toBeNull();
    expect(canonicalizeUrl(key!, url)).toBe(url);
  });

  it('never rewrites a /pornstar/ link into the /model/ namespace', () => {
    const url = 'https://www.pornhub.com/pornstar/chris-allen';
    expect(canonicalizeUrl('pornhub', url)).not.toContain('/model/');
  });

  it('keeps the namespace in the handle so the two spaces stay distinct', () => {
    expect(normalizeHandle('pornhub', 'https://www.pornhub.com/pornstar/chris-allen')).toBe(
      'pornstar/chris-allen',
    );
    expect(normalizeHandle('pornhub', 'https://www.pornhub.com/model/chris-allen')).toBe(
      'model/chris-allen',
    );
  });

  it('gives a bare handle the curated default namespace', () => {
    expect(canonicalizeUrl('pornhub', 'https://www.pornhub.com/pornstar/x-y')).toContain(
      '/pornstar/',
    );
    // A handle with no namespace can only be defaulted, never guessed.
    expect(normalizeHandle('pornhub', 'chris-allen')).toBe('chris-allen');
  });

  it('detects each host as its own platform', () => {
    expect(detectPlatform('https://www.pornhub.com/pornstar/a-b')).toBe('pornhub');
    expect(detectPlatform('https://xhamster.com/pornstars/a-b')).toBe('xhamster');
    expect(detectPlatform('https://www.xvideos.com/models/a-b')).toBe('xvideos');
  });

  it('flags all three as adult so the UI badges them 18+', () => {
    expect(isAdultPlatform('pornhub')).toBe(true);
    expect(isAdultPlatform('xhamster')).toBe(true);
    expect(isAdultPlatform('xvideos')).toBe(true);
  });

  it('shows a readable handle, not the raw namespaced one', () => {
    // Without this the card renders no handle at all: displayHandle returns
    // null for anything still path-shaped.
    expect(displayHandle('pornhub', 'pornstar/jay-magnus')).toBe('jay-magnus');
    expect(displayHandle('xhamster', 'pornstars/rico-loko')).toBe('rico-loko');
    expect(displayHandle('xvideos', 'models/pierre-fitch')).toBe('pierre-fitch');
  });

  it('normalizes a whole social_links map without mangling namespaces', () => {
    expect(
      normalizeSocialLinks({
        pornhub: 'https://www.pornhub.com/pornstar/arty-boer',
        xvideos: 'https://www.xvideos.com/models/pierre-fitch',
      }),
    ).toEqual({
      pornhub: 'https://www.pornhub.com/pornstar/arty-boer',
      xvideos: 'https://www.xvideos.com/models/pierre-fitch',
    });
  });
});
