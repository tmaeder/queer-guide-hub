import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const usePublicRecognitionsMock = vi.fn();

vi.mock('@/hooks/useRecognitions', () => ({
  usePublicRecognitions: (...args: unknown[]) => usePublicRecognitionsMock(...args),
}));

import Contributors from '../Contributors';

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/contributors/:year" element={<Contributors />} />
          <Route path="/contributors" element={<Contributors />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Contributors page', () => {
  beforeEach(() => {
    usePublicRecognitionsMock.mockReset();
  });

  it('renders year heading and empty state', () => {
    usePublicRecognitionsMock.mockReturnValue({
      data: { rows: [], error: null },
      isLoading: false,
    });
    renderAt('/contributors/2026');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2026');
    expect(screen.getByText(/No recognitions published for 2026 yet/i)).toBeInTheDocument();
  });

  it('groups featured and category rows', () => {
    usePublicRecognitionsMock.mockReturnValue({
      data: {
        rows: [
          {
            id: 'a',
            year: 2026,
            category: 'editorial',
            blurb_md: 'Led the year',
            featured: true,
            rank: 1,
            display_name: 'Alex',
            avatar_url: null,
            user_id: 'u1',
          },
          {
            id: 'b',
            year: 2026,
            category: 'venue_scout',
            blurb_md: '47 new venues',
            featured: false,
            rank: null,
            display_name: 'Sam',
            avatar_url: null,
            user_id: 'u2',
          },
        ],
        error: null,
      },
      isLoading: false,
    });
    renderAt('/contributors/2026');
    expect(screen.getByText('Featured')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Venue scouts')).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();
  });

  it('rejects out-of-range year', () => {
    usePublicRecognitionsMock.mockReturnValue({
      data: { rows: [], error: null },
      isLoading: false,
    });
    renderAt('/contributors/1999');
    expect(screen.getByText('Invalid year')).toBeInTheDocument();
  });
});
