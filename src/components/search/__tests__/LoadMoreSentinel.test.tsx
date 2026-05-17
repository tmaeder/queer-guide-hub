import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultOrVars?: string | Record<string, unknown>) =>
      typeof defaultOrVars === 'string' ? defaultOrVars : key,
  }),
}));

import { LoadMoreSentinel } from '../LoadMoreSentinel';

describe('LoadMoreSentinel', () => {
  it('renders nothing when hasMore is false', () => {
    const { container } = render(
      <LoadMoreSentinel hasMore={false} loading={false} onLoadMore={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows a Load more button and fires onLoadMore on click', () => {
    const onLoadMore = vi.fn();
    render(<LoadMoreSentinel hasMore loading={false} onLoadMore={onLoadMore} />);
    const btn = screen.getByRole('button', { name: /Load more/i });
    fireEvent.click(btn);
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('shows a loading state and disables the button while loading', () => {
    render(<LoadMoreSentinel hasMore loading onLoadMore={() => {}} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('IntersectionObserver fires onLoadMore at most once per mount', () => {
    let capturedCallback: IntersectionObserverCallback | null = null;
    const disconnect = vi.fn();
    const observe = vi.fn();
    class FakeIO {
      constructor(cb: IntersectionObserverCallback) {
        capturedCallback = cb;
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = vi.fn();
      root = null;
      rootMargin = '';
      thresholds: number[] = [];
    }
    const originalIO = window.IntersectionObserver;
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;
    const onLoadMore = vi.fn();
    render(<LoadMoreSentinel hasMore loading={false} onLoadMore={onLoadMore} />);
    expect(observe).toHaveBeenCalled();
    // Simulate two intersection ticks before React has a chance to flip
    // `loading` and tear the observer down.
    capturedCallback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    capturedCallback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalled();
    (window as unknown as { IntersectionObserver: typeof IntersectionObserver | undefined }).IntersectionObserver = originalIO;
  });
});
