/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { countRowsMock } = vi.hoisted(() => ({ countRowsMock: vi.fn() }));

vi.mock('@/hooks/usePageFetchers', () => ({ countRows: countRowsMock }));

import { UserStatsCards } from '../UserStatsCards';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  countRowsMock.mockReset();
});

describe('UserStatsCards', () => {
  it('renders all four card labels', () => {
    countRowsMock.mockResolvedValue(0);
    render(<UserStatsCards />, { wrapper });
    expect(screen.getByText('Total Users')).toBeInTheDocument();
    expect(screen.getByText('New This Week')).toBeInTheDocument();
    expect(screen.getByText('Active Now')).toBeInTheDocument();
    expect(screen.getByText('Moderation Issues')).toBeInTheDocument();
  });

  it('renders count values once query resolves, locale-formatted', async () => {
    countRowsMock
      .mockResolvedValueOnce(1234)
      .mockResolvedValueOnce(56)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2);
    render(<UserStatsCards />, { wrapper });
    await waitFor(() => expect(screen.getByText('1,234')).toBeInTheDocument());
    expect(screen.getByText('56')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
