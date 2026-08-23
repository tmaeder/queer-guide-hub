import { describe, it, expect } from 'vitest';
import { resolveScrollAction, withoutLocale, hashTargetId } from '../scrollBehavior';
import type { NavSnapshot } from '../scrollBehavior';

const at = (pathname: string, search = '', hash = ''): NavSnapshot => ({ pathname, search, hash });

describe('withoutLocale', () => {
  it('drops a supported locale prefix', () => {
    expect(withoutLocale('/de/venues')).toBe('/venues');
    expect(withoutLocale('/ar/city/berlin')).toBe('/city/berlin');
    expect(withoutLocale('/de')).toBe('/');
  });

  it('leaves an unprefixed path alone', () => {
    expect(withoutLocale('/venues')).toBe('/venues');
    expect(withoutLocale('/')).toBe('/');
  });

  it('does NOT treat a two-letter route as a locale', () => {
    // stripLocale() in @/lib/locale matches any /[a-z]{2}/ segment and so
    // reads the signed-in user's own /me as the locale "me" on an empty path.
    // Treating a /me -> / hop as a language switch would leave the reader at
    // their previous offset on a different page.
    expect(withoutLocale('/me')).toBe('/me');
    expect(withoutLocale('/me/saved')).toBe('/me/saved');
  });
});

describe('hashTargetId', () => {
  it('reads the id a fragment names', () => {
    expect(hashTargetId('#codes')).toBe('codes');
    expect(hashTargetId('#your-rights')).toBe('your-rights');
    expect(hashTargetId('#caf%C3%A9')).toBe('café');
  });

  it('names no element for an empty or bare fragment', () => {
    expect(hashTargetId('')).toBe('');
    expect(hashTargetId('#')).toBe('');
  });

  it('survives a malformed percent-escape rather than throwing', () => {
    expect(hashTargetId('#100%')).toBe('100%');
  });
});

describe('resolveScrollAction', () => {
  describe('a link to a different page', () => {
    it('lands at the top — the reported bug', () => {
      // Measured before the fix: from y=4163 on /about, clicking /venues left
      // the reader at y=2567 of maxY 2567, i.e. the footer.
      expect(resolveScrollAction(at('/about'), at('/venues'), 'PUSH', undefined)).toEqual({
        kind: 'top',
      });
    });

    it('lands at the top even when that entry has a remembered offset', () => {
      // A forward navigation is a fresh read, not a return.
      expect(resolveScrollAction(at('/about'), at('/venues'), 'PUSH', 900)).toEqual({
        kind: 'top',
      });
    });

    it('lands on the section a fragment names', () => {
      expect(
        resolveScrollAction(at('/tags'), at('/tags/hiv-aids', '', '#codes'), 'PUSH', undefined),
      ).toEqual({ kind: 'hash', id: 'codes' });
    });

    it('treats a redirect the same as a link', () => {
      expect(
        resolveScrollAction(at('/vendors'), at('/admin/business'), 'REPLACE', undefined),
      ).toEqual({ kind: 'top' });
    });
  });

  describe('staying on the same page', () => {
    it('does not move the reader when only the query changes', () => {
      // ~90 of the app's ~103 setSearchParams call sites push a history entry
      // for a same-page state change. Resetting on those would fling the
      // reader to the top every time they ticked a filter.
      expect(
        resolveScrollAction(at('/venues'), at('/venues', '?category=sauna'), 'PUSH', undefined),
      ).toEqual({ kind: 'keep' });
    });

    it('does not move the reader for a tab switch', () => {
      expect(
        resolveScrollAction(
          at('/city/berlin', '?tab=venues'),
          at('/city/berlin', '?tab=events'),
          'PUSH',
          undefined,
        ),
      ).toEqual({ kind: 'keep' });
    });

    it('does not move the reader for a replace-mode pagination bump', () => {
      expect(
        resolveScrollAction(
          at('/people', '?page=2'),
          at('/people', '?page=3'),
          'REPLACE',
          undefined,
        ),
      ).toEqual({ kind: 'keep' });
    });

    it('does not move the reader when only the language changes', () => {
      expect(resolveScrollAction(at('/venues'), at('/de/venues'), 'PUSH', undefined)).toEqual({
        kind: 'keep',
      });
    });

    it('honours a NEW fragment on the same page', () => {
      expect(
        resolveScrollAction(at('/privacy'), at('/privacy', '', '#retention'), 'PUSH', undefined),
      ).toEqual({ kind: 'hash', id: 'retention' });
    });

    it('ignores a fragment that was already there', () => {
      // useActiveStation rewrites the fragment to whatever the reader has
      // scrolled to. Re-jumping to it would pin the page against them.
      expect(
        resolveScrollAction(
          at('/privacy', '', '#retention'),
          at('/privacy', '?x=1', '#retention'),
          'PUSH',
          undefined,
        ),
      ).toEqual({ kind: 'keep' });
    });
  });

  describe('back and forward', () => {
    it('returns the reader to the offset they left', () => {
      expect(resolveScrollAction(at('/venues'), at('/cities'), 'POP', 2042)).toEqual({
        kind: 'restore',
        top: 2042,
      });
    });

    it('restores in preference to a fragment — they may have read on', () => {
      expect(
        resolveScrollAction(at('/venues'), at('/privacy', '', '#retention'), 'POP', 900),
      ).toEqual({ kind: 'restore', top: 900 });
    });

    it('falls back to the fragment when nothing was recorded', () => {
      expect(
        resolveScrollAction(at('/venues'), at('/privacy', '', '#retention'), 'POP', undefined),
      ).toEqual({ kind: 'hash', id: 'retention' });
    });

    it('falls back to the top when there is neither', () => {
      expect(resolveScrollAction(at('/venues'), at('/cities'), 'POP', undefined)).toEqual({
        kind: 'top',
      });
      expect(resolveScrollAction(at('/venues'), at('/cities'), 'POP', 0)).toEqual({ kind: 'top' });
    });

    it('restores on a same-page POP too', () => {
      // Back out of a filter: the entry being returned to has its own offset.
      expect(
        resolveScrollAction(at('/venues', '?category=sauna'), at('/venues'), 'POP', 639),
      ).toEqual({ kind: 'restore', top: 639 });
    });
  });

  describe('first render', () => {
    it('leaves a plain page load alone', () => {
      expect(resolveScrollAction(null, at('/venues'), 'POP', undefined)).toEqual({ kind: 'keep' });
    });

    it('honours a deep link fragment', () => {
      // The browser's own jump fires before the SPA has rendered the target,
      // so it has to be redone once the element exists.
      expect(resolveScrollAction(null, at('/rights', '', '#marriage'), 'POP', undefined)).toEqual({
        kind: 'hash',
        id: 'marriage',
      });
    });

    it('restores the reading position across a reload', () => {
      expect(resolveScrollAction(null, at('/venues'), 'POP', 1500)).toEqual({
        kind: 'restore',
        top: 1500,
      });
    });

    it('prefers the fragment over a stored offset on first render', () => {
      expect(resolveScrollAction(null, at('/privacy', '', '#retention'), 'POP', 1500)).toEqual({
        kind: 'hash',
        id: 'retention',
      });
    });
  });
});
