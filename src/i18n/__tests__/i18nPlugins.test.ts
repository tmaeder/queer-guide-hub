/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { languageDetector, localeBackend } from '@/i18n';

const detect = () => languageDetector.detect!() as string[];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  document.documentElement.lang = '';
});

describe('languageDetector', () => {
  it('orders path, saved choice, browser, then <html lang>', () => {
    window.history.replaceState(null, '', '/de/events');
    localStorage.setItem('i18nextLng', 'fr');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-ES', 'en']);
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es');
    document.documentElement.lang = 'it';
    expect(detect()).toEqual(['de', 'fr', 'es-ES', 'en', 'es', 'it']);
  });

  it('ignores a path segment that is not a locale', () => {
    window.history.replaceState(null, '', '/events');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue([]);
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en');
    expect(detect()).toEqual(['en']);
  });

  it('saves the chosen language', () => {
    languageDetector.cacheUserLanguage!('pt');
    expect(localStorage.getItem('i18nextLng')).toBe('pt');
    languageDetector.cacheUserLanguage!('cimode');
    expect(localStorage.getItem('i18nextLng')).toBe('pt');
  });
});

describe('localeBackend', () => {
  const read = (lng: string) =>
    new Promise<[unknown, unknown]>((resolve) =>
      localeBackend.read(lng, 'translation', (err, data) => resolve([err, data])),
    );

  it('fetches /locales/<lng>.json', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"hi":"salut"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await read('fr')).toEqual([null, { hi: 'salut' }]);
    expect(fetchMock).toHaveBeenCalledWith('/locales/fr.json');
  });

  it('does not request unsupported locales', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await read('../outside'))[1]).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry malformed locale JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>')));
    expect((await read('fr'))[1]).toBe(false);
  });

  it('asks for a retry on 5xx and network errors, not on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    expect((await read('fr'))[1]).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    expect((await read('fr'))[1]).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect((await read('fr'))[1]).toBe(true);
  });
});
