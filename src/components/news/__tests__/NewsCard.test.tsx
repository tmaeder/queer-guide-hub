/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    const { container } = render(<MemoryRouter><NewsCard loading /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
  it('renders article', () => {
    const { container } = render(
      <MemoryRouter><NewsCard article={ARTICLE} /></MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });

  // `default`, `featured` and `compact` each embed a share button (and the
  // default variant a favorite button) that used to sit inside the card link.
  it.each(['default', 'featured', 'compact'] as const)(
    'nests no interactive element inside the card link (%s variant)',
    (variant) => {
      const { container } = render(
        <MemoryRouter><NewsCard article={ARTICLE} variant={variant} /></MemoryRouter>,
      );
      expectNoNestedInteractive(container);
      expect(screen.getByRole('link')).toHaveAttribute('href', '/news/story');
    },
  );

  // The default variant navigated via onClick on a <div> — no href, no
  // keyboard access. It must now be a real link.
  it('makes the default variant keyboard-reachable via a real link', () => {
    render(<MemoryRouter><NewsCard article={ARTICLE} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Story' })).toBeInTheDocument();
  });
});
