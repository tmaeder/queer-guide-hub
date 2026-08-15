/**
 * @vitest-environment jsdom
 *
 * The homepage mounts a second search (the hero) while the header already
 * carries one. These are the invariants that make two mounts legal; each one
 * was a hard blocker before the props existed, and each fails silently in
 * different ways (a duplicate ARIA id only surfaces in the a11y sweep, a
 * second ⌘K owner only surfaces as a focus race).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';

vi.mock('@/hooks/useSearchSuggestions', () => ({
  useSearchSuggestions: () => ({
    suggestions: [],
    countsByType: {},
    loading: false,
    error: null,
  }),
}));
vi.mock('@/hooks/useTrendingSuggestions', () => ({
  useTrendingSuggestions: () => ({ trending: [], loading: false }),
}));
vi.mock('@/hooks/useSearchRecommendations', () => ({
  useSearchRecommendations: () => ({ recommendations: [], loading: false }),
}));
vi.mock('@/hooks/useVoiceSearch', () => ({
  useVoiceSearch: () => ({ supported: false, listening: false, start: vi.fn(), stop: vi.fn() }),
}));
vi.mock('@/hooks/useAssistant', () => ({
  useAssistant: () => ({ ask: vi.fn(), reset: vi.fn(), loading: false, answer: null, cards: [] }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useUserMode', () => ({ useUserMode: () => ({ mode: null }) }));
vi.mock('@/hooks/useSearchActions', () => ({ useTrackClick: () => vi.fn() }));

import { UniversalSearchBar } from '../UniversalSearchBar';

let addSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.restoreAllMocks();
  addSpy = vi.spyOn(window, 'addEventListener');
});

describe('two search mounts on one page', () => {
  it('adds NO extra global keydown listener for a mount that does not own the hotkey', () => {
    // Other libraries (Radix) bind keydown too, so count the DIFFERENCE a
    // second mount makes rather than the absolute total.
    const countKeydown = () => addSpy.mock.calls.filter(([evt]) => evt === 'keydown').length;

    renderWithProviders(<UniversalSearchBar />);
    const withOne = countKeydown();

    addSpy.mockClear();
    renderWithProviders(<UniversalSearchBar size="hero" hotkey={false} surface="hero" />);
    const addedBySecond = countKeydown();

    // Two owners would open both popovers on ⌘K and race each other's
    // focusInput(), landing focus wherever resolved last. An inert callback is
    // not enough — the disabled mount must not bind at all.
    expect(withOne).toBeGreaterThan(0);
    expect(addedBySecond).toBeLessThan(withOne);
  });

  it('gives each mount a DISTINCT listbox id', () => {
    const { container } = renderWithProviders(
      <>
        <UniversalSearchBar />
        <UniversalSearchBar size="hero" hotkey={false} surface="hero" />
      </>,
    );
    const ids = Array.from(container.querySelectorAll('[aria-controls]')).map((el) =>
      el.getAttribute('aria-controls'),
    );
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('gives each mount a DISTINCT search landmark name', () => {
    const { container } = renderWithProviders(
      <>
        <UniversalSearchBar />
        <UniversalSearchBar size="hero" hotkey={false} surface="hero" />
      </>,
    );
    // Two `role="search"` regions sharing a name trips axe `landmark-unique`.
    const names = Array.from(container.querySelectorAll('[role="search"]')).map((el) =>
      el.getAttribute('aria-label'),
    );
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
  });

  it('renders the header mount unchanged at its defaults', () => {
    // The header mounts this on EVERY route; the new props must be inert
    // unless asked for.
    const { container } = renderWithProviders(<UniversalSearchBar />);
    const input = container.querySelector('input');
    expect(input?.getAttribute('aria-controls')).toBe('qg-search-listbox-header');
    expect(container.querySelector('[role="search"]')).toBeTruthy();
  });
});
