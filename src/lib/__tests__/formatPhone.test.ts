import { describe, it, expect } from 'vitest';
import { formatPhoneDisplay, formatPhoneHref } from '../formatPhone';

describe('formatPhoneHref', () => {
  // A reader asked whether tapping a venue's phone number dials it on a phone.
  // It was rendered as `tel:${venue.phone}` with the raw stored string, and RFC 3966
  // allows only digits, a leading `+` and the visual separators -.() — spaces are not
  // valid in a tel URI, and this corpus is full of them.
  it('strips spaces and separators the tel: scheme does not allow', () => {
    expect(formatPhoneHref('+49 30 2134570')).toBe('tel:+49302134570');
    expect(formatPhoneHref('(212) 555-1234')).toBe('tel:2125551234');
    expect(formatPhoneHref('+1 212-475-2220')).toBe('tel:+12124752220');
  });

  it('keeps an already-clean E.164 number unchanged', () => {
    expect(formatPhoneHref('+12124752220')).toBe('tel:+12124752220');
  });

  it('keeps a LEADING + only', () => {
    // An interior + means two numbers were concatenated; we cannot tell which to dial,
    // so the digits are joined rather than silently dialling half of one.
    expect(formatPhoneHref('+49 30 111 / +49 30 222')).toBe('tel:+49301114930222');
  });

  it('returns null when nothing dialable is left, so the caller can render text', () => {
    // A dead `tel:` link is worse than plain text — it looks tappable and does nothing,
    // which is the class of bug this whole change is fixing.
    expect(formatPhoneHref('call the bar')).toBeNull();
    expect(formatPhoneHref('n/a')).toBeNull();
    expect(formatPhoneHref('123')).toBeNull();
    expect(formatPhoneHref('')).toBeNull();
    expect(formatPhoneHref(null)).toBeNull();
    expect(formatPhoneHref(undefined)).toBeNull();
  });

  it('accepts a 5-digit short code', () => {
    // Boundary: shorter than 5 is treated as a fragment, 5 is a real short number.
    expect(formatPhoneHref('12345')).toBe('tel:12345');
  });
});

describe('formatPhoneDisplay', () => {
  // Unchanged behaviour, pinned because formatPhoneHref now sits beside it and the two
  // must stay independent: the display string keeps its spaces, the href must not.
  it('groups a bare E.164 number for reading', () => {
    expect(formatPhoneDisplay('+49302134570')).toBe('+49 302 134 570');
  });

  it('leaves an already human-formatted number alone', () => {
    expect(formatPhoneDisplay('(212) 555-1234')).toBe('(212) 555-1234');
  });

  it('passes non-numeric text through untouched', () => {
    expect(formatPhoneDisplay('call the bar')).toBe('call the bar');
    expect(formatPhoneDisplay(null)).toBeNull();
  });
});
