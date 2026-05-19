/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}));
vi.mock('@/utils/safeDisplay', () => ({ safeText: (s: string) => s }));
vi.mock('@/utils/htmlDecode', () => ({ decodeHtmlEntities: (s: string) => s }));
vi.mock('@/utils/fallbackImages', () => ({ getRandomFallbackImage: () => '/fallback.png' }));

import { StoryCard } from '../StoryCard';

const story = {
  id: 's1',
  slug: 'pride-2026',
  title: 'Pride 2026 highlights',
  article_count: 7,
  last_updated_at: new Date(Date.now() - 60_000).toISOString(),
} as never;

describe('StoryCard', () => {
  it('renders title + article count + relative timestamp + link', () => {
    render(<StoryCard story={story} />);
    expect(screen.getByText('Pride 2026 highlights')).toBeInTheDocument();
    expect(screen.getByText(/7 articles/)).toBeInTheDocument();
    expect(screen.getByText(/Updated.*ago/)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/news/story/pride-2026');
  });

  it('uses hero image when provided', () => {
    const { container } = render(<StoryCard story={story} hero={{ image_url: '/hero.jpg', excerpt: 'lead' } as never} />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', '/hero.jpg');
    expect(screen.getByText('lead')).toBeInTheDocument();
  });

  it('falls back to placeholder on image error', () => {
    const { container } = render(<StoryCard story={story} hero={{ image_url: '/broken.jpg' } as never} />);
    const img = container.querySelector('img')!;
    fireEvent.error(img);
    expect(img).toHaveAttribute('src', '/fallback.png');
  });
});
