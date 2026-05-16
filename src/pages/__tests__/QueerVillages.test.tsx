/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useVillagesMock, fetchVillagesFn } = vi.hoisted(() => ({
  useVillagesMock: vi.fn(),
  fetchVillagesFn: vi.fn(),
}));

vi.mock('@/hooks/useQueerVillages', () => ({ useQueerVillages: useVillagesMock }));
vi.mock('@/components/villages/VillageCard', () => ({
  VillageCard: (p: { village: { id: string; name: string } }) => <div data-testid="village">{p.village.name}</div>,
}));

import QueerVillages from '../QueerVillages';

beforeEach(() => {
  useVillagesMock.mockReset();
  fetchVillagesFn.mockReset();
});

describe('QueerVillages page', () => {
  it('shows spinner while loading and no data', () => {
    useVillagesMock.mockReturnValue({ villages: [], loading: true, fetchVillages: fetchVillagesFn });
    render(<QueerVillages />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('shows empty state', () => {
    useVillagesMock.mockReturnValue({ villages: [], loading: false, fetchVillages: fetchVillagesFn });
    render(<QueerVillages />);
    expect(screen.getByText(/No queer villages found/)).toBeInTheDocument();
  });

  it('renders one card per village', () => {
    useVillagesMock.mockReturnValue({
      villages: [{ id: '1', name: 'Castro' }, { id: '2', name: 'Schöneberg' }],
      loading: false,
      fetchVillages: fetchVillagesFn,
    });
    render(<QueerVillages />);
    expect(screen.getAllByTestId('village')).toHaveLength(2);
  });
});
