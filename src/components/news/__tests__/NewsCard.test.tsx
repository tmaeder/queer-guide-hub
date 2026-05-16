/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { NewsCard } from '../NewsCard';

describe('NewsCard', () => {
  it('renders loading state', () => {
    const { container } = render(<MemoryRouter><NewsCard loading /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
  it('renders article', () => {
    const { container } = render(
      <MemoryRouter>
        <NewsCard article={{ id: 'n1', title: 'Story', slug: 'story', published_at: '2026-05-15T00:00:00Z' } as never} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
