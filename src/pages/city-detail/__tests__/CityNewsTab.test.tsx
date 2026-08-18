/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/news/NewsCard', () => ({
  NewsCard: (p: { article: { id: string; title?: string } }) => (
    <div data-testid="news">{p.article.title}</div>
  ),
}));

import { CityNewsTab } from '../CityNewsTab';

describe('CityNewsTab', () => {
  it('renders nothing when there are no articles', () => {
    // Rule 2: no empty shell. 2,200 of 3,070 cities have no coverage, and the
    // page drops the whole section for them rather than printing "check back
    // later".
    const { container } = render(<CityNewsTab articles={[] as never} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders up to 6 article cards', () => {
    const articles = Array.from({ length: 10 }).map((_, i) => ({
      id: String(i),
      title: `T${i}`,
    })) as never;
    render(<CityNewsTab articles={articles} />);
    expect(screen.getAllByTestId('news')).toHaveLength(6);
  });
});
