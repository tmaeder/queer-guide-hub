/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/news/NewsCard', () => ({
  NewsCard: (p: { article: { id: string; title?: string } }) => <div data-testid="news">{p.article.title}</div>,
}));
vi.mock('@/components/ui/loading', () => ({
  InlineLoading: (p: { text: string }) => <div>{p.text}</div>,
}));
vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: (p: { title: string }) => <div>{p.title}</div>,
}));
vi.mock('@/components/animation/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { CityNewsTab } from '../CityNewsTab';

const city = { name: 'Berlin' } as never;

describe('CityNewsTab', () => {
  it('shows loading indicator', () => {
    render(<CityNewsTab city={city} articles={[]} newsLoading />);
    expect(screen.getByText(/Loading news/)).toBeInTheDocument();
  });

  it('shows empty state when no articles', () => {
    render(<CityNewsTab city={city} articles={[]} newsLoading={false} />);
    expect(screen.getByText(/No news available/)).toBeInTheDocument();
  });

  it('renders up to 6 article cards', () => {
    const articles = Array.from({ length: 10 }).map((_, i) => ({ id: String(i), title: `T${i}` })) as never;
    render(<CityNewsTab city={city} articles={articles} newsLoading={false} />);
    expect(screen.getAllByTestId('news')).toHaveLength(6);
  });
});
