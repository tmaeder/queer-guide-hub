import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/test-utils';
import { CountryMap } from '../CountryMap';
import { COUNTRY_MAP_CODES, type CountryMapData } from '../countryMapIndex';

const load = (code: string): CountryMapData =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, '../../../../public/maps/country', `${code.toLowerCase()}.json`),
      'utf8',
    ),
  );

/**
 * Subjects are picked OUT OF the index by the property each test needs, never
 * named, so a regeneration that adds or drops a country cannot break this
 * suite — the discipline `CityNetwork.test.tsx` uses for the same reason.
 *
 * Picking by PROPERTY and not just `[0]` is load-bearing: the index starts at
 * Andorra, which is a single landmass, so "one path per polygon" read `1 === 1`
 * and survived a mutation that collapsed every polygon into one path.
 */
const pick = (want: (d: CountryMapData) => boolean, why: string): CountryMapData => {
  for (const code of COUNTRY_MAP_CODES) {
    const d = load(code);
    if (want(d)) return d;
  }
  throw new Error(`no country in the index ${why}`);
};

const fixture = pick((d) => d.land.length > 2 && d.dots.length > 0, 'has several landmasses');
const SUBJECT = fixture.iso;

/** A country that carries a capital, so the label branch is exercised. */
const WITH_LABEL = pick((d) => !!d.label, 'carries a capital label');

function mockFetch(data: CountryMapData) {
  // The `url` parameter is declared even though the body ignores it: without it
  // the mock's call tuple is `[]` and asserting on the requested path does not
  // typecheck.
  return vi.fn(
    async (_url: string) =>
      ({ ok: true, status: 200, json: async () => data }) as unknown as Response,
  );
}

describe('CountryMap', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch(fixture));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders nothing for a country with no committed geometry', () => {
    // French Guiana — folded into the France feature by Natural Earth.
    const { container } = renderWithProviders(<CountryMap code="GF" name="French Guiana" />);
    expect(container.querySelector('[data-testid="country-map"]')).toBeNull();
  });

  it('renders nothing when the code is absent', () => {
    const { container } = renderWithProviders(<CountryMap code={null} name="Nowhere" />);
    expect(container.querySelector('[data-testid="country-map"]')).toBeNull();
  });

  it('never fetches for an unknown country', () => {
    const spy = mockFetch(fixture);
    vi.stubGlobal('fetch', spy);
    renderWithProviders(<CountryMap code="ZZ" name="Nowhere" />);
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches the lowercase static path for a known country', async () => {
    const spy = mockFetch(fixture);
    vi.stubGlobal('fetch', spy);
    renderWithProviders(<CountryMap code={SUBJECT} name={fixture.name} />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][0]).toBe(`/maps/country/${SUBJECT.toLowerCase()}.json`);
  });

  it('draws one path per landmass and names itself', async () => {
    const { container } = renderWithProviders(<CountryMap code={SUBJECT} name={fixture.name} />);
    const svg = await screen.findByRole('img', { name: fixture.name });
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${fixture.w} ${fixture.h}`);

    // One <path> per polygon. Concatenating them into a single evenodd path
    // makes overlapping landmasses cancel and punch holes in the fill.
    const land = container.querySelectorAll('path.fill-background');
    expect(land.length).toBe(fixture.land.length);

    expect(container.querySelectorAll('circle').length).toBe(fixture.dots.length);
  });

  it('gates every track-coloured dot with the ink ring', async () => {
    const { container } = renderWithProviders(<CountryMap code={SUBJECT} name={fixture.name} />);
    await screen.findByRole('img', { name: fixture.name });
    const dots = [...container.querySelectorAll('circle')];
    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) {
      // WCAG 1.4.11: a track fill always carries the ring, and the ring token
      // is ink in BOTH themes so it cannot invert.
      expect(dot.getAttribute('class')).toContain('fill-track-yellow');
      expect(dot.getAttribute('class')).toContain('stroke-track-ring');
    }
  });

  it('renders the capital label as HTML, not SVG text', async () => {
    vi.stubGlobal('fetch', mockFetch(WITH_LABEL));
    const { container } = renderWithProviders(
      <CountryMap code={WITH_LABEL.iso} name={WITH_LABEL.name} />,
    );
    const label = await screen.findByText(WITH_LABEL.label!.t);
    expect(label.tagName).toBe('SPAN');
    // Anton, and positioned off the capital's own dot.
    expect(label.className).toContain('font-display');
    expect(label.style.left).toBe(`${(WITH_LABEL.label!.x / WITH_LABEL.w) * 100}%`);
    expect(container.querySelectorAll('text').length).toBe(0);
  });

  it('reserves the frame while the fetch is in flight', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { container } = renderWithProviders(<CountryMap code={SUBJECT} name={fixture.name} />);
    expect(container.querySelector('[data-testid="country-map"]')).not.toBeNull();
    expect(container.querySelector('.aspect-\\[10\\/7\\]')).not.toBeNull();
  });
});
