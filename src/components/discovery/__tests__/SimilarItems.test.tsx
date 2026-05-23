/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useSearchActions', () => ({ useTrackClick: () => vi.fn() }));
const fetchSimilarMock = vi.fn();
vi.mock('@/lib/searchClient', () => ({ fetchSimilar: (...args: unknown[]) => fetchSimilarMock(...args) }));

import { SimilarItems } from '../SimilarItems';

describe('SimilarItems', () => {
  it('renders', () => {
    fetchSimilarMock.mockResolvedValueOnce([]);
    const entity = { id: 'e1', contentType: 'venue', title: 'X' } as never;
    const { container } = render(<MemoryRouter><SimilarItems entity={entity} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });

  it('renders metadata.title verbatim (no slug-kebab fallback) when worker enriched the row', async () => {
    fetchSimilarMock.mockResolvedValueOnce([
      {
        content_type: 'city',
        content_id: '11111111-1111-1111-1111-111111111111',
        score: 0.9,
        metadata: { title: 'Berlin', slug: 'berlin', country: 'Germany' },
      },
    ]);
    render(
      <MemoryRouter>
        <SimilarItems entity={{ type: 'city', id: 'src-city' } as never} contentTypes={['city']} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Berlin')).toBeTruthy());
    expect(screen.getByText('Germany')).toBeTruthy();
    expect(screen.queryByText('berlin')).toBeNull();
  });

  it('falls back to slug-kebab if title missing', async () => {
    fetchSimilarMock.mockResolvedValueOnce([
      {
        content_type: 'city',
        content_id: '22222222-2222-2222-2222-222222222222',
        score: 0.8,
        metadata: { slug: 'new-york' },
      },
    ]);
    render(
      <MemoryRouter>
        <SimilarItems entity={{ type: 'city', id: 'src-city' } as never} contentTypes={['city']} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('new york')).toBeTruthy());
  });
});
