/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders as render, screen, waitFor } from '@/test/test-utils';

vi.mock('@/hooks/useSearchActions', () => ({ useTrackClick: () => vi.fn() }));
const fetchSimilarMock = vi.fn();
vi.mock('@/lib/searchClient', () => ({
  fetchSimilar: (...args: unknown[]) => fetchSimilarMock(...args),
}));

import { SimilarItems } from '../SimilarItems';

describe('SimilarItems', () => {
  it('renders', () => {
    fetchSimilarMock.mockResolvedValueOnce([]);
    const entity = { id: 'e1', contentType: 'venue', title: 'X' } as never;
    const { container } = render(<SimilarItems entity={entity} />);
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
      <SimilarItems entity={{ type: 'city', id: 'src-city' } as never} contentTypes={['city']} />,
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
      <SimilarItems entity={{ type: 'city', id: 'src-city' } as never} contentTypes={['city']} />,
    );
    await waitFor(() => expect(screen.getByText('new york')).toBeTruthy());
  });

  it('draws a country without a photo as the station plate with the globe', async () => {
    fetchSimilarMock.mockResolvedValueOnce([
      {
        content_type: 'country',
        content_id: '33333333-3333-3333-3333-333333333333',
        score: 0.8,
        metadata: { title: 'Austria', slug: 'austria' },
      },
    ]);
    const { container } = render(
      <SimilarItems entity={{ type: 'country', id: 'src' } as never} contentTypes={['country']} />,
    );
    await waitFor(() => expect(screen.getByText('Austria')).toBeTruthy());
    expect(container.querySelector('[data-fallback="station"]')).not.toBeNull();
    expect(container.querySelector('[data-station-badge]')).toBeNull();
  });

  it('puts the mark on the seam when a country has a photo', async () => {
    fetchSimilarMock.mockResolvedValueOnce([
      {
        content_type: 'country',
        content_id: '44444444-4444-4444-4444-444444444444',
        score: 0.8,
        metadata: {
          title: 'Spain',
          slug: 'spain',
          image_url: 'https://img.queer.guide/countries/spain.jpg',
        },
      },
    ]);
    const { container } = render(
      <SimilarItems entity={{ type: 'country', id: 'src' } as never} contentTypes={['country']} />,
    );
    await waitFor(() => expect(screen.getByText('Spain')).toBeTruthy());
    expect(container.querySelector('[data-station-badge="globe"]')).not.toBeNull();
  });
});
