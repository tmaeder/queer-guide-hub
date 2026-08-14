/**
 * @vitest-environment jsdom
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

const reducedMotion = vi.hoisted(() => ({ value: false }));
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => reducedMotion.value,
}));
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { renderWithProviders, screen, expectNoNestedInteractive } from '@/test/test-utils';
import { RouteLineStage } from '../RouteLineStage';
import en from '@/i18n/locales/en.json';
import type { Station } from '@/lib/lines/generateLine';

/**
 * The global test setup initialises no i18n instance, so react-i18next returns
 * each `t(key, 'default', opts)` call's default string VERBATIM — placeholders
 * and all. That makes every accessible name in this component ("Stop 1: Berlin,
 * Germany") untestable, and those names are the whole reason the decorative SVG
 * can be aria-hidden.
 *
 * So bind a real instance here, against the shipped English bundle. That also
 * means this suite fails if a key used by these components is missing from
 * en.json, rather than silently passing on the inline fallback.
 *
 * Scoped to this file on purpose: `expectNoPlaceholderLeaks` in test-utils
 * treats an unresolved {{moustache}} as a bug, so turning interpolation on
 * repo-wide is the right change — but it is a change with its own blast radius
 * and does not belong inside a feature branch.
 */
beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
});

function station(i: number, over: Partial<Station> = {}): Station {
  return {
    id: `c${i}`,
    name: `City ${i}`,
    slug: `city-${i}`,
    imageUrl: null,
    description: `A description of city ${i}.`,
    safetyNotes: 'Same-sex relationships are legal here.',
    editorialHook: null,
    latitude: 40 + i,
    longitude: 10,
    timezone: 'Europe/Berlin',
    population: 100_000,
    countryId: `k${i}`,
    countryName: `Country ${i}`,
    countryCode: 'XX',
    currency: 'EUR',
    equalityScore: 80,
    criminalization: null,
    venueCount: 42,
    nightlifeCount: 10,
    saunaCount: 2,
    cafeCount: 5,
    communityCount: 1,
    outdoorCount: 2,
    shopCount: 1,
    eventCount: 0,
    prideCount: 0,
    nextEventAt: null,
    nextEventTitle: null,
    eventMonths: [],
    villageCount: 0,
    villageName: null,
    ...over,
  };
}

const line = (n: number) => Array.from({ length: n }, (_, i) => station(i));

describe('RouteLineStage', () => {
  it.each([3, 4, 5])('draws one bending segment per stop (n=%i)', (n) => {
    const { container } = renderWithProviders(
      <RouteLineStage stations={line(n)} generation={0} window={null} />,
    );
    // `svg > g > path`, not `svg path`: TransitIcon inside each plate renders
    // its own <path> as a direct child of its <svg>, so the looser selector
    // counted the legality icons as route segments.
    const paths = [...container.querySelectorAll('svg > g > path')];
    // Two SVGs — the stretched horizontal band and the fixed vertical rail —
    // so one segment per stop in each.
    expect(paths).toHaveLength(n * 2);
    for (const p of paths) {
      const d = p.getAttribute('d') ?? '';
      // Hard rule #1 of the design system, as an assertion.
      expect(d).not.toMatch(/[LHVlhv]/);
      expect(d).toMatch(/^M [-\d.]+ [-\d.]+ C /);
    }
  });

  it('refuses to draw a line that would not be one', () => {
    // Two points make a single crest, which renders as a rule with dots on it.
    const { container } = renderWithProviders(
      <RouteLineStage stations={line(2)} generation={0} window={null} />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('hides the track from assistive tech and puts every fact in the plates', () => {
    const { container } = renderWithProviders(
      <RouteLineStage stations={line(4)} generation={0} window={null} />,
    );
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
    expect(container.querySelectorAll('svg > g > path')).toHaveLength(8);
    // An ordered list, because a route is ordered and DOM order must equal
    // route order must equal focus order.
    const list = container.querySelector('ol#route-stations');
    expect(list).not.toBeNull();
    expect(list!.querySelectorAll(':scope > li')).toHaveLength(4);
  });

  it('names each stop with its position and country', () => {
    renderWithProviders(<RouteLineStage stations={line(3)} generation={0} window={null} />);
    expect(screen.getByRole('link', { name: /Stop 1: City 0, Country 0/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Stop 3: City 2, Country 2/ })).toBeInTheDocument();
  });

  // The swap control is why the plate is a <div> with an overlay link rather
  // than an <a> wrapping everything: a button inside an anchor is axe
  // nested-interactive, serious, WCAG 4.1.2.
  it('keeps the swap button out of the overlay anchor', () => {
    const onSwap = vi.fn();
    const { container } = renderWithProviders(
      <RouteLineStage stations={line(3)} generation={0} window={null} onSwap={onSwap} />,
    );
    expectNoNestedInteractive(container);
    const swap = screen.getAllByRole('button', { name: /Swap stop 1, City 0/ })[0];
    expect(swap.closest('a')).toBeNull();
  });

  it('shows an event only when the season window actually contains one', () => {
    const withEvent = [
      station(0, { eventMonths: ['2026-08'], nextEventTitle: 'Some Pride' }),
      station(1),
      station(2),
    ];
    const window0 = { id: 'now' as const, months: ['2026-08'], start: new Date('2026-08-01') };
    const { rerender } = renderWithProviders(
      <RouteLineStage stations={withEvent} generation={0} window={window0} />,
    );
    expect(screen.getByText('Some Pride')).toBeInTheDocument();

    // No window picked — silence, because silence is not a claim.
    rerender(<RouteLineStage stations={withEvent} generation={0} window={null} />);
    expect(screen.queryByText('Some Pride')).toBeNull();
  });

  // The reveal is keyed on `generation`, so the first paint of the page is the
  // resting state. If this regresses, the page animates on load — which is what
  // moves it out of the "functional motion" category the design system allows
  // on travel routes.
  // Reduced motion has TWO independent guards — this hook never applies the
  // displaced class, and each keyframe disables itself in a media query. This
  // pins the first one, which is the one that can regress in a refactor.
  it('renders the final state instantly under prefers-reduced-motion', () => {
    reducedMotion.value = true;
    try {
      const { container } = renderWithProviders(
        // generation > 0 — the animating path everywhere else.
        <RouteLineStage stations={line(5)} generation={3} window={null} />,
      );
      expect(container.querySelectorAll('.opacity-0')).toHaveLength(0);
      expect(container.querySelectorAll('.route-draw')).toHaveLength(0);
      expect(container.querySelectorAll('.station-pop')).toHaveLength(0);
      expect(container.querySelectorAll('#route-stations > li')).toHaveLength(5);
    } finally {
      reducedMotion.value = false;
    }
  });

  it('renders at rest on first paint, with nothing hidden', () => {
    const { container } = renderWithProviders(
      <RouteLineStage stations={line(4)} generation={0} window={null} />,
    );
    expect(container.querySelectorAll('.opacity-0')).toHaveLength(0);
    expect(container.querySelectorAll('.route-draw')).toHaveLength(0);
  });
});
