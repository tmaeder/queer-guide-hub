import { directionsUrl, safeHttpsUrl, telUrl } from '../links';

describe('safeHttpsUrl', () => {
  it.each([
    ['https://queer.guide/x', 'https://queer.guide/x'],
    ['http://example.com', 'https://example.com/'],
    ['example.com/path', 'https://example.com/path'],
    ['  https://a.example  ', 'https://a.example/'],
  ])('%s → %s', (input, out) => expect(safeHttpsUrl(input)).toBe(out));

  it.each(['javascript:alert(1)', 'mailto:x@y.z', 'ftp://example.com', 'localhost', '', null, undefined])(
    'rejects %p',
    (input) => expect(safeHttpsUrl(input as string | null | undefined)).toBeNull(),
  );
});

describe('telUrl', () => {
  it('keeps E.164 as is', () => expect(telUrl('+41441234567')).toBe('tel:+41441234567'));
  it('strips formatting', () => expect(telUrl('+41 (44) 123-45 67')).toBe('tel:+41441234567'));
  it('refuses junk', () => {
    expect(telUrl('n/a')).toBeNull();
    expect(telUrl(null)).toBeNull();
  });
});

describe('directionsUrl', () => {
  it('uses Apple Maps on iOS and a geo: intent elsewhere', () => {
    expect(directionsUrl('ios', 47.37, 8.54, 'Heaven & Hell')).toBe(
      'https://maps.apple.com/?daddr=47.37,8.54&q=Heaven%20%26%20Hell',
    );
    expect(directionsUrl('android', 47.37, 8.54, 'Bar')).toBe('geo:47.37,8.54?q=47.37,8.54(Bar)');
  });
});
