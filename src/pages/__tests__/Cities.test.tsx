/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useCitiesMock } = vi.hoisted(() => ({ useCitiesMock: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/usePlaces', () => ({ useOptimizedCities: useCitiesMock }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/components/directory/DirectoryCard', () => ({
  DirectoryCard: (p: { name: string }) => <div data-testid="card">{p.name}</div>,
}));
vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: (p: { title: string }) => <div>{p.title}</div>,
  ErrorState: (p: { message: string }) => <div>{p.message}</div>,
}));
vi.mock('@/components/ui/loading', () => ({
  PageLoading: () => <div data-testid="loading" />,
}));
vi.mock('@/components/discovery', () => ({
  PageHero: () => <div data-testid="hero" />,
  BentoSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  spansForPreset: () => 'sm',
}));

import Cities from '../Cities';

beforeEach(() => useCitiesMock.mockReset());

describe('Cities page', () => {
  it('shows loading state', () => {
    useCitiesMock.mockReturnValue({ cities: [], loading: true, error: null });
    render(<Cities />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows error state', () => {
    useCitiesMock.mockReturnValue({ cities: [], loading: false, error: 'oops' });
    render(<Cities />);
    expect(screen.getByText('oops')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    useCitiesMock.mockReturnValue({ cities: [], loading: false, error: null });
    render(<Cities />);
    expect(screen.getByText(/No cities found/i)).toBeInTheDocument();
  });

  it('renders one card per city', () => {
    useCitiesMock.mockReturnValue({
      cities: [{ id: '1', name: 'Berlin' }, { id: '2', name: 'Hamburg' }],
      loading: false,
      error: null,
    });
    render(<Cities />);
    expect(screen.getAllByTestId('card')).toHaveLength(2);
  });
});
