/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useFestivalsMock, fetchFn } = vi.hoisted(() => ({
  useFestivalsMock: vi.fn(),
  fetchFn: vi.fn(),
}));

vi.mock('@/hooks/useFestivals', () => ({ useFestivals: useFestivalsMock }));
vi.mock('@/components/festivals/FestivalCard', () => ({
  FestivalCard: (p: { festival: { id: string; name?: string } }) => <div data-testid="fest">{p.festival.name}</div>,
}));

import Festivals from '../Festivals';

beforeEach(() => {
  useFestivalsMock.mockReset();
  fetchFn.mockReset();
});

describe('Festivals page', () => {
  it('shows spinner while loading', () => {
    useFestivalsMock.mockReturnValue({ festivals: [], loading: true, fetchFestivals: fetchFn });
    render(<Festivals />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('shows empty message', () => {
    useFestivalsMock.mockReturnValue({ festivals: [], loading: false, fetchFestivals: fetchFn });
    render(<Festivals />);
    expect(screen.getByText(/No festivals found/)).toBeInTheDocument();
  });

  it('renders one card per festival', () => {
    useFestivalsMock.mockReturnValue({
      festivals: [{ id: '1', name: 'Pride NYC' }],
      loading: false,
      fetchFestivals: fetchFn,
    });
    render(<Festivals />);
    expect(screen.getByText('Pride NYC')).toBeInTheDocument();
  });
});
