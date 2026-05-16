/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const {
  navigateFn, useAuthMock, useTripMutationsMock, useToastMock, useTemplatesMock,
  createTripMutate, insertRowsMock, toastFn,
} = vi.hoisted(() => ({
  navigateFn: vi.fn(),
  useAuthMock: vi.fn(),
  useTripMutationsMock: vi.fn(),
  useToastMock: vi.fn(),
  useTemplatesMock: vi.fn(),
  createTripMutate: vi.fn(),
  insertRowsMock: vi.fn(),
  toastFn: vi.fn(),
}));

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigateFn }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/useTrips', () => ({ useTripMutations: useTripMutationsMock }));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/hooks/useTripTemplates', () => ({ useTripTemplates: useTemplatesMock }));
vi.mock('@/hooks/usePageFetchers', () => ({ insertRows: insertRowsMock }));
vi.mock('@/components/animation/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { TripTemplates } from '../TripTemplates';

beforeEach(() => {
  navigateFn.mockReset();
  useAuthMock.mockReset();
  useTripMutationsMock.mockReset();
  useToastMock.mockReset();
  useTemplatesMock.mockReset();
  createTripMutate.mockReset();
  insertRowsMock.mockReset();
  toastFn.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
  useTripMutationsMock.mockReturnValue({ createTrip: { mutate: createTripMutate, isPending: false } });
  useToastMock.mockReturnValue({ toast: toastFn });
  insertRowsMock.mockResolvedValue({ error: null });
});

describe('TripTemplates', () => {
  it('renders skeletons while loading', () => {
    useTemplatesMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<TripTemplates />);
    expect(container.querySelectorAll('[class*="animate-pulse"], [class*="MuiSkeleton"]').length).toBeGreaterThan(0);
  });

  it('renders one card per template', () => {
    useTemplatesMock.mockReturnValue({
      data: [
        { id: '1', title: 'Berlin Pride', cities: 'Berlin', days: 7, currency: 'EUR', cityIds: ['c1'], coverImageUrl: null, gradient: '#000' },
        { id: '2', title: 'NYC Drag Tour', cities: 'NYC', days: 5, currency: 'USD', cityIds: [], coverImageUrl: null, gradient: '#000' },
      ],
      isLoading: false,
    });
    render(<TripTemplates />);
    expect(screen.getByText('Berlin Pride')).toBeInTheDocument();
    expect(screen.getByText('NYC Drag Tour')).toBeInTheDocument();
    expect(screen.getByText('7 days')).toBeInTheDocument();
  });

  it('clicking Use Template fires createTrip mutation with template data', () => {
    useTemplatesMock.mockReturnValue({
      data: [{ id: '1', title: 'X', cities: 'X', days: 3, currency: 'EUR', cityIds: ['c1'], coverImageUrl: null, gradient: '#000' }],
      isLoading: false,
    });
    render(<TripTemplates />);
    fireEvent.click(screen.getAllByRole('button', { name: /Use Template/i })[0]);
    expect(createTripMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'X', currency: 'EUR' }),
      expect.any(Object),
    );
  });
});
