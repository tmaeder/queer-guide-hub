/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';
import type { SectionDef } from '../types';

/**
 * The scroll-spy in EditorialDetailLayout persists the active section to
 * `?section=` on a 300ms debounce. Until 2026-09-12 it wrote unconditionally,
 * and React Router mints a fresh location object for every navigate call
 * even when the resulting URL is byte-identical — so anything keyed on
 * `location` counted it as a navigation.
 *
 * Measured on prod: /travel alone recorded 268,313 page views across 981
 * sessions in 30 days, and 1,244 sessions like it produced 59% of ALL site
 * traffic. One session fired 582 views of /travel in 233 seconds: 2.5/s, which
 * is this 300ms timer running as a clock.
 *
 * The first two cases are the fix and the third its positive control. Without
 * the control, "navigate was not called" also passes when the effect is
 * deleted outright.
 */

const navigate = vi.fn();
let activeId: string | null = 'stay';
let currentSearch = '';

vi.mock('@/components/transit/useActiveSection', () => ({
  useActiveSection: () => [activeId, vi.fn()] as const,
}));
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(currentSearch), vi.fn()] as const,
    useNavigate: () => navigate,
  };
});

const { EditorialDetailLayout } = await import('../EditorialDetailLayout');

const sections: SectionDef[] = [
  { id: 'intro', label: 'Intro', content: <p>intro</p> },
  { id: 'stay', label: 'Stay', content: <p>stay</p> },
  { id: 'eat', label: 'Eat', content: <p>eat</p> },
];

function render() {
  return renderWithProviders(
    <EditorialDetailLayout
      header={<h1>Header</h1>}
      sections={sections}
      breadcrumbs={[{ label: 'Test', href: '/test' }]}
      entityType="intent"
      loading={false}
      error={null}
    />,
  );
}

beforeEach(() => {
  navigate.mockClear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, '', '/');
});

describe('EditorialDetailLayout — ?section= writes', () => {
  it('does NOT write when the URL already names the active section', () => {
    // This is the loop: the spy sits on one section while the reader scrolls
    // within it, and every debounce tick used to re-navigate to the same URL.
    activeId = 'stay';
    currentSearch = 'section=stay';
    window.history.replaceState({}, '', '/travel?section=stay');

    render();
    vi.advanceTimersByTime(1000);

    expect(navigate).not.toHaveBeenCalled();
  });

  it('does NOT write when the active section is the first one and the URL is already bare', () => {
    // The first section is represented by the ABSENCE of ?section=, which is
    // why 563 of one burst session's 585 recorded views were bare /travel.
    activeId = 'intro';
    currentSearch = '';
    window.history.replaceState({}, '', '/travel');

    render();
    vi.advanceTimersByTime(1000);

    expect(navigate).not.toHaveBeenCalled();
  });

  it('DOES write once when the reader actually moves to another section', () => {
    activeId = 'eat';
    currentSearch = 'section=stay';
    window.history.replaceState({}, '', '/travel?section=stay');

    render();
    vi.advanceTimersByTime(1000);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0]).toEqual({ search: '?section=eat', hash: '' });
    expect(navigate.mock.calls[0][1]).toEqual({ replace: true });
  });

  it('keeps the #fragment when it writes ?section=', () => {
    // /rights#marriage redirects to /tags/rights-by-country#marriage. The
    // first scroll-spy write used setSearchParams, which navigates to a bare
    // `?…` and dropped the anchor — the page scrolled to the right but the
    // URL a reader copied no longer pointed at it.
    activeId = 'eat';
    currentSearch = '';
    window.history.replaceState({}, '', '/tags/rights-by-country#marriage');

    render();
    vi.advanceTimersByTime(1000);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0]).toEqual({ search: '?section=eat', hash: '#marriage' });
  });
});
