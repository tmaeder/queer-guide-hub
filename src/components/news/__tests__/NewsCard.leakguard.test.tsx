import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { NewsCard } from '../NewsCard';
import { expectNoPlaceholderLeaks } from '@/test/assertNoLeaks';

vi.mock('@/components/ui/favorite-button', () => ({
  FavoriteButton: () => null,
}));

type Article = Parameters<typeof NewsCard>[0]['article'];

function makeArticle(overrides: Record<string, unknown> = {}): Article {
  return {
    id: 'a-1',
    slug: 'sample-story',
    title: 'Sample story',
    excerpt: null,
    content: null,
    author: null,
    url: 'https://example.com/x',
    image_url: null,
    source_id: 's-1',
    category: 'general',
    published_at: null,
    views_count: null,
    is_featured: false,
    city_ids: null,
    country_ids: null,
    ...overrides,
  } as unknown as Article;
}

function renderCard(article: Article, extra: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <NewsCard article={article} {...extra} />
    </MemoryRouter>,
  );
}

describe('NewsCard — placeholder-leak guard', () => {
  it('renders cleanly with only required fields', () => {
    const { container } = renderCard(makeArticle());
    expectNoPlaceholderLeaks(container);
  });

  it('does not leak when excerpt/author/publisher are null', () => {
    const { container } = renderCard(
      makeArticle({
        excerpt: null,
        author: null,
        publisher_name: null,
        views_count: null,
      }),
    );
    expectNoPlaceholderLeaks(container);
  });

  it('does not leak when excerpt contains an unrendered moustache template', () => {
    const { container } = renderCard(
      makeArticle({ excerpt: 'Hello {{author}} — welcome', title: 'Weekly {{digest}}' }),
    );
    expectNoPlaceholderLeaks(container);
  });

  it('does not leak when author is an object (API drift)', () => {
    const { container } = renderCard(
      makeArticle({ author: { name: 'x' } as unknown }),
    );
    expectNoPlaceholderLeaks(container);
  });

  it('does not leak when tags include placeholder literals', () => {
    const { container } = renderCard(
      makeArticle({ category: 'politics' }),
      { tags: ['pride', 'null', 'undefined', ''] },
    );
    expectNoPlaceholderLeaks(container);
  });

  it('does not leak with populated article', () => {
    const { container } = renderCard(
      makeArticle({
        title: 'Full story',
        excerpt: 'A normal excerpt.',
        author: 'Alex Doe',
        publisher_name: 'Queer Times',
        views_count: 42,
        category: 'politics',
        published_at: '2025-01-01T00:00:00Z',
      }),
    );
    expectNoPlaceholderLeaks(container);
  });

  it('headline variant does not leak with sparse data', () => {
    const { container } = renderCard(
      makeArticle({ publisher_name: null }),
      { variant: 'headline' },
    );
    expectNoPlaceholderLeaks(container);
  });

  it('featured variant does not leak with sparse data', () => {
    const { container } = renderCard(
      makeArticle({ publisher_name: null, excerpt: null, author: null }),
      { variant: 'featured' },
    );
    expectNoPlaceholderLeaks(container);
  });
});
