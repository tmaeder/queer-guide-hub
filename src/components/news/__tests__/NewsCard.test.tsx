/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { expectNoNestedInteractive } from '@/test/test-utils';
import { NewsCard } from '../NewsCard';

const ARTICLE = {
  id: 'n1',
  title: 'Story',
  slug: 'story',
  published_at: '2026-05-15T00:00:00Z',
} as never;

describe('NewsCard', () => {
  it('renders loading state', () => {
    const { container } = render(
      <MemoryRouter>
        <NewsCard loading />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
  it('renders article', () => {
    const { container } = render(
      <MemoryRouter>
        <NewsCard article={ARTICLE} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });

  // `default`, `featured` and `compact` each embed a share button (and the
  // default variant a favorite button) that used to sit inside the card link.
  it.each(['default', 'featured', 'compact'] as const)(
    'nests no interactive element inside the card link (%s variant)',
    (variant) => {
      const { container } = render(
        <MemoryRouter>
          <NewsCard article={ARTICLE} variant={variant} />
        </MemoryRouter>,
      );
      expectNoNestedInteractive(container);
      expect(screen.getByRole('link')).toHaveAttribute('href', '/news/story');
    },
  );

  // The default variant navigated via onClick on a <div> — no href, no
  // keyboard access. It must now be a real link.
  it('makes the default variant keyboard-reachable via a real link', () => {
    render(
      <MemoryRouter>
        <NewsCard article={ARTICLE} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Story' })).toBeInTheDocument();
  });

  it.each(['default', 'section-hero', 'featured', 'compact'] as const)(
    'draws the category plate instead of a stock texture when there is no photo (%s)',
    (variant) => {
      const { container } = render(
        <MemoryRouter>
          <NewsCard
            article={{ ...(ARTICLE as object), category_canonical: 'politics' } as never}
            variant={variant}
          />
        </MemoryRouter>,
      );
      expect(container.querySelector('[data-fallback="station"]')).not.toBeNull();
      expect(container.querySelector('img')).toBeNull();
    },
  );

  it('puts the category mark on a badge over a photo, and drops it if the photo fails', () => {
    const { container } = render(
      <MemoryRouter>
        <NewsCard
          article={
            {
              ...(ARTICLE as object),
              category_canonical: 'politics',
              image_url: 'https://img.queer.guide/images/a.jpg',
            } as never
          }
        />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-station-badge="megaphone"]')).not.toBeNull();
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('[data-station-badge]')).toBeNull();
    expect(container.querySelector('[data-fallback="station"]')).not.toBeNull();
  });
  it('waits for a first-party mirror rather than requesting the publisher photo', () => {
    const article = {
      ...(ARTICLE as object),
      image_url: 'https://images.pexels.com/a.jpg',
    } as never;
    const { container, rerender } = render(
      <MemoryRouter>
        <NewsCard article={article} />
      </MemoryRouter>,
    );
    expect(container.querySelector('img')).toBeNull();
    rerender(
      <MemoryRouter>
        <NewsCard
          article={article}
          imageAsset={{
            id: 'asset',
            url: 'https://images.pexels.com/a.jpg',
            optimized_url: 'https://img.queer.guide/images/a.jpg',
            thumbnail_url: null,
            optimization_status: 'optimized',
          }}
        />
      </MemoryRouter>,
    );
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://img.queer.guide/images/a.jpg',
    );
  });
});
