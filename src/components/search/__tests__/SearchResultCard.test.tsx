/**
 * @vitest-environment jsdom
 *
 * The whole result row must be a real `<a href>`, not a `<div role="button">`.
 *
 * It was the latter from the day /search shipped until 2026-08-29. Measured on
 * prod that day: 20 result rows, every one `role="button"`, and
 * `document.querySelectorAll('a[href]')` found NOTHING pointing at any of them
 * — so no result could be middle-clicked, cmd-clicked or opened in a new tab,
 * screen readers announced "button" instead of "link" and the rows were absent
 * from the page's link list, and a crawler following links found no path out of
 * /search. Clicking worked, which is exactly why it survived: the feature was
 * fine, the element was wrong.
 *
 * These tests pin the shape of the fix, not just its existence — an anchor that
 * WRAPS the card would satisfy "there is a link" while tripping axe
 * `nested-interactive` (serious, WCAG 4.1.2), because every row carries 2-3
 * real `<button>`s (feedback thumbs, add-to-trip).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';

const { trackFn } = vi.hoisted(() => ({ trackFn: vi.fn() }));

vi.mock('@/hooks/useSearchActions', () => ({
  useFeedbackVote: () => vi.fn(),
  useTrackClick: () => trackFn,
}));

// Needs an AuthProvider it doesn't get here. Stubbed as a REAL <button> on
// purpose: the row's buttons are what make the nested-interactive assertion
// below meaningful, so replacing it with a <div> would quietly defang the test
// that guards the whole point of this change.
vi.mock('@/components/trips/QuietAddToTripButton', () => ({
  QuietAddToTripButton: () => <button type="button">Add to trip</button>,
}));

import { renderWithProviders, expectNoNestedInteractive } from '@/test/test-utils';
import { SearchResultCard } from '../SearchResultCard';
import type { SearchResult } from '@/hooks/useSearch';

function hit(over: Partial<SearchResult> = {}): SearchResult {
  return {
    objectID: '11111111-1111-4111-8111-111111111111',
    type: 'venue',
    title: 'SchwuZ',
    slug: 'schwuz',
    ...over,
  } as SearchResult;
}

beforeEach(() => {
  trackFn.mockReset();
});

describe.each(['list', 'grid'] as const)('SearchResultCard (%s view)', (view) => {
  it('renders the row as an anchor carrying the entity detail href', () => {
    const { container } = renderWithProviders(
      <SearchResultCard result={hit()} view={view} query="schwuz" />,
    );
    const link = container.querySelector('a[href]');
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute('href', '/venues/schwuz');
  });

  it('labels the overlay link — it has no text of its own', () => {
    renderWithProviders(<SearchResultCard result={hit()} view={view} query="" />);
    // getByRole('link', {name}) is the assertion that matters: it is what a
    // screen reader resolves, and it fails on both a missing aria-label and a
    // `role="button"` regression.
    expect(screen.getByRole('link', { name: 'SchwuZ' })).toBeInTheDocument();
  });

  it('carries no-underline — `li a:not(.no-underline)` would force position:relative and collapse the overlay', () => {
    const { container } = renderWithProviders(
      <SearchResultCard result={hit()} view={view} query="" />,
    );
    const link = container.querySelector('a[href]')!;
    expect(link.className).toContain('no-underline');
    expect(link.className).toContain('absolute');
  });

  it('renders the link as a SIBLING of the card body, never a wrapper', () => {
    const { container } = renderWithProviders(
      <SearchResultCard
        result={hit({ tags: ['nightlife'] })}
        view={view}
        query=""
        onTagClick={() => {}}
      />,
    );
    // The row's feedback buttons are real <button>s. A wrapping anchor would
    // put them inside it.
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
    expectNoNestedInteractive(container);
  });

  it('does not fall back to a role="button" click handler', () => {
    const { container } = renderWithProviders(
      <SearchResultCard result={hit()} view={view} query="" />,
    );
    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  it('fires onActivate for analytics when the link is clicked', () => {
    const onActivate = vi.fn();
    const { container } = renderWithProviders(
      <SearchResultCard result={hit()} view={view} query="" onActivate={onActivate} />,
    );
    fireEvent.click(container.querySelector('a[href]')!);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0][0].objectID).toBe(hit().objectID);
  });

  it('routes a tag hit by NAME, not slug — /tags/:tagName is name-keyed', () => {
    const { container } = renderWithProviders(
      <SearchResultCard
        result={hit({ type: 'tag', title: 'Poppers', slug: 'poppers-slug' })}
        view={view}
        query="poppers"
      />,
    );
    expect(container.querySelector('a[href]')).toHaveAttribute('href', '/tags/poppers');
  });

  it('falls back to a fresh search rather than fabricating a /type/<uuid> dead link', () => {
    const { container } = renderWithProviders(
      <SearchResultCard
        result={hit({ slug: undefined, title: 'No Slug Venue' })}
        view={view}
        query=""
      />,
    );
    expect(container.querySelector('a[href]')).toHaveAttribute(
      'href',
      '/search?q=No%20Slug%20Venue',
    );
  });
});
