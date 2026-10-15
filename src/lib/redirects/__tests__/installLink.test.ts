import { describe, expect, it } from 'vitest';
import { installEntryUrl } from '../installLink';
describe('public app-install entry links', () => {
  it('preserves campaign context on canonical, branded and domain-root links', () => {
    for (const source of [
      'https://queer.guide/go/community',
      'https://links.example.com/short',
      'https://links.example.com/',
    ]) {
      const url = new URL(installEntryUrl(source + '?utm_source=poster&ref=community%2Bfriends')!);
      expect(url.origin + url.pathname).toBe(source);
      expect(url.searchParams.get('qg_handoff')).toBe('install');
      expect(url.searchParams.get('utm_source')).toBe('poster');
      expect(url.searchParams.get('ref')).toBe('community+friends');
    }
  });
  it('does not turn a private, marked or malformed URL into a public install entry', () => {
    for (const url of [
      'http://example.com/',
      'https://person:private@example.com/',
      'https://example.com:8443/',
      'https://example.com/#private',
      ' https://example.com/',
      'bad',
      'https://example.com/' + 'x'.repeat(2048),
      ...[
        'pw',
        'password',
        'qg_click_id',
        'qg_handoff',
        'qg_app_choice',
        'qg_handoff_token',
        'x-qg-handoff-token',
        'PASSWORD',
        '%70assword',
      ].map((field) => 'https://example.com/?' + field + '=private'),
    ])
      expect(installEntryUrl(url)).toBeNull();
  });
});
