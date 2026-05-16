/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const {
  useSuggestionsMock, usePackingMutationsMock, useLlmMock, useToastMock,
  addMutate, llmMutate, toastFn,
} = vi.hoisted(() => ({
  useSuggestionsMock: vi.fn(),
  usePackingMutationsMock: vi.fn(),
  useLlmMock: vi.fn(),
  useToastMock: vi.fn(),
  addMutate: vi.fn(),
  llmMutate: vi.fn(),
  toastFn: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? k,
  }),
}));
vi.mock('@/hooks/useTripPackingSuggestions', () => ({ useTripPackingSuggestions: useSuggestionsMock }));
vi.mock('@/hooks/useTripPacking', () => ({ usePackingMutations: usePackingMutationsMock }));
vi.mock('@/hooks/useLlmPackingSuggestions', () => ({ useLlmPackingSuggestions: useLlmMock }));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/utils/tripTracking', () => ({
  recordSuggestionImpression: vi.fn(),
  recordSuggestionClick: vi.fn(),
}));
vi.mock('@/components/trips/shared/SuggestionCard', () => ({
  SuggestionCard: (p: { title: string }) => <div data-testid="sug">{p.title}</div>,
}));
vi.mock('@/components/layout/PageLoadingState', () => ({
  PageLoadingState: () => <div data-testid="loading" />,
}));

import { PackingMarketplaceSuggestions } from '../PackingMarketplaceSuggestions';

beforeEach(() => {
  useSuggestionsMock.mockReset();
  usePackingMutationsMock.mockReset();
  useLlmMock.mockReset();
  useToastMock.mockReset();
  addMutate.mockReset();
  llmMutate.mockReset();
  toastFn.mockReset();
  useToastMock.mockReturnValue({ toast: toastFn });
  usePackingMutationsMock.mockReturnValue({ addPackingItem: { mutate: addMutate, isPending: false } });
  useLlmMock.mockReturnValue({ mutate: llmMutate, isPending: false });
});

describe('PackingMarketplaceSuggestions', () => {
  it('shows loading state while fetching', () => {
    useSuggestionsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<PackingMarketplaceSuggestions tripId="t1" />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows empty message when no suggestions', () => {
    useSuggestionsMock.mockReturnValue({ data: [], isLoading: false });
    render(<PackingMarketplaceSuggestions tripId="t1" />);
    expect(screen.getByText(/trips.packing.noSuggestions/i)).toBeInTheDocument();
  });

  it('renders one SuggestionCard per item grouped by category', () => {
    useSuggestionsMock.mockReturnValue({
      data: [
        { id: 'a', title: 'Sunscreen', category: 'health', provider: 'Amazon' },
        { id: 'b', title: 'Adapter', category: 'gear', provider: 'Amazon' },
      ],
      isLoading: false,
    });
    render(<PackingMarketplaceSuggestions tripId="t1" />);
    expect(screen.getAllByTestId('sug')).toHaveLength(2);
  });
});
