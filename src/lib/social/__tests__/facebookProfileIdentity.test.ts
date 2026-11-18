import { describe, expect, it } from 'vitest';
import * as frontend from '../registry';
import * as ingestion from '../../../../supabase/functions/_shared/social';

for (const [name, social] of Object.entries({ frontend, ingestion })) {
  describe(`${name}: Facebook profile identities`, () => {
    const cases = [
      ['https://facebook.com/groups/123456789012345/?ref=share', 'groups/123456789012345'],
      ['https://m.facebook.com/profile.php/?id=100083802717576', 'profile.php?id=100083802717576'],
      [
        'https://www.facebook.com/profile.php?id=100063547843654&fref=ts#',
        'profile.php?id=100063547843654',
      ],
      [
        'https://m.facebook.com/profile.php?fref=ts&id=12345678901234567890',
        'profile.php?id=12345678901234567890',
      ],
      [
        'https://www.facebook.com/people/Allied-Trees/100063920740281/?ref=bookmarks',
        'people/Allied-Trees/100063920740281',
      ],
      [
        'http://www.facebook.com/pages/Business-Name/123456789012345/',
        'pages/Business-Name/123456789012345',
      ],
      [
        'https://web.facebook.com/pages/category/Local-Business/Some-Page-12345/?ref=page_internal',
        'pages/category/Local-Business/Some-Page-12345',
      ],
      ['https://www.facebook.com/StonewallUK/?ref=bookmarks', 'StonewallUK'],
    ];

    it.each(cases)('preserves the identity in %s', (url, identity) => {
      const expected = `https://facebook.com/${identity}`;
      expect(social.detectPlatform(url)).toBe('facebook');
      expect(social.normalizeHandle('facebook', url)).toBe(identity);
      expect(social.canonicalizeUrl('facebook', url)).toBe(expected);
      expect(social.normalizeSocialLinks({ facebook: url })).toEqual({ facebook: expected });
      expect(social.canonicalizeUrl('facebook', expected)).toBe(expected);
    });

    it('keeps distinct numeric profiles distinct without numeric conversion', () => {
      const profiles = ['12345678901234567890', '12345678901234567891'].map((id) =>
        social.canonicalizeUrl('facebook', `https://facebook.com/profile.php?id=${id}`),
      );
      expect(new Set(profiles).size).toBe(2);
    });

    it('retains the required ID through a Facebook login wrapper', () => {
      const profile = 'https://www.facebook.com/profile.php?id=100063547843654&ref=bookmarks';
      const wrapper = `https://www.facebook.com/login.php?next=${encodeURIComponent(profile)}`;
      expect(social.unwrapLoginWall(wrapper)).toBe(
        'https://www.facebook.com/profile.php?id=100063547843654',
      );
      expect(social.normalizeSocialLinks({ facebook: wrapper })).toEqual({
        facebook: 'https://facebook.com/profile.php?id=100063547843654',
      });
    });

    it('does not invent an identity for an incomplete legacy URL or an unrelated host', () => {
      for (const url of [
        'https://facebook.com/profile.php',
        'https://facebook.com/people',
        'https://facebook.com/pages',
        'https://facebook.com.evil.example/profile.php?id=123',
      ]) {
        expect(social.normalizeHandle('facebook', url)).toBeNull();
      }
    });

    it('continues excluding share widgets and login wrappers targeting them', () => {
      const share = 'https://www.facebook.com/sharer/sharer.php?u=https://example.org';
      expect(social.normalizeSocialLinks({ facebook: share })).toEqual({});
      expect(
        social.unwrapLoginWall(`https://facebook.com/login.php?next=${encodeURIComponent(share)}`),
      ).toBeNull();
    });
  });
}
