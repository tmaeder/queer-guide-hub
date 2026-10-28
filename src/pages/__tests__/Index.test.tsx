/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/home/subway/HeroSearch', () => ({ HeroSearch: () => null }));
vi.mock('@/components/home/HomeContent', () => ({
  default: () => <section data-testid="home-content">Content bands</section>,
}));

import Index from '../Index';

const originalObserver = globalThis.IntersectionObserver;
afterEach(() => {
  globalThis.IntersectionObserver = originalObserver;
});

describe('Index startup', () => {
  it('renders the hero and primary navigation before loading below-fold content', async () => {
    let intersect: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    globalThis.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = () => [];
    } as unknown as typeof IntersectionObserver;

    render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    );
    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveTextContent('No straight lines here.');
    expect(title.className).not.toContain('sr-only');
    expect(screen.getByRole('link', { name: /open the map/i })).toHaveAttribute('href', '/map');
    expect(screen.getByText('Search everything').closest('a')).toHaveAttribute('href', '/search');
    expect(screen.queryByTestId('home-content')).not.toBeInTheDocument();

    await act(async () => {
      intersect?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(await screen.findByTestId('home-content')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBe(title);
    expect(disconnect).toHaveBeenCalled();
  });
});
