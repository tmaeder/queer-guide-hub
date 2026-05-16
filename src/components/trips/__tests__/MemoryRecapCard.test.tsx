/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useRecapMock, useGenerateMock, useToastMock, generateMutateAsync, toastFn } = vi.hoisted(() => ({
  useRecapMock: vi.fn(),
  useGenerateMock: vi.fn(),
  useToastMock: vi.fn(),
  generateMutateAsync: vi.fn(),
  toastFn: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, optsOrDefault?: string | Record<string, unknown>) => {
      if (typeof optsOrDefault === 'string') return optsOrDefault;
      const def = (optsOrDefault as { defaultValue?: string } | undefined)?.defaultValue ?? _k;
      return def;
    },
  }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/hooks/useTripRecap', () => ({
  useTripRecap: useRecapMock,
  useGenerateTripRecap: useGenerateMock,
}));

import { MemoryRecapCard } from '../MemoryRecapCard';

beforeEach(() => {
  useRecapMock.mockReset();
  useGenerateMock.mockReset();
  useToastMock.mockReset();
  generateMutateAsync.mockReset();
  toastFn.mockReset();
  useToastMock.mockReturnValue({ toast: toastFn });
  useGenerateMock.mockReturnValue({ mutateAsync: generateMutateAsync, isPending: false });
  generateMutateAsync.mockResolvedValue(undefined);
});

describe('MemoryRecapCard', () => {
  it('shows spinner while loading', () => {
    useRecapMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<MemoryRecapCard tripId="t1" />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty CTA when no recap; click triggers generate', () => {
    useRecapMock.mockReturnValue({ data: null, isLoading: false });
    render(<MemoryRecapCard tripId="t1" />);
    expect(screen.getByText(/Your trip, in a paragraph/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Generate recap/i }));
    expect(generateMutateAsync).toHaveBeenCalledWith({ refresh: false });
  });

  it('renders summary + highlight badges when recap present', () => {
    useRecapMock.mockReturnValue({
      data: {
        summary: 'A warm summary.',
        generated_at: '2026-05-15',
        highlights: {
          cities: ['Berlin', 'Hamburg'],
          favourite_day: { date: '2026-06-05' },
          total_spent: [{ currency: 'EUR', amount: 1200 }],
        },
      },
      isLoading: false,
    });
    render(<MemoryRecapCard tripId="t1" />);
    expect(screen.getByText('A warm summary.')).toBeInTheDocument();
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('Hamburg')).toBeInTheDocument();
  });

  it('Regenerate button triggers generate with refresh=true', () => {
    useRecapMock.mockReturnValue({
      data: { summary: 'x', generated_at: '2026-05-15', highlights: { cities: [] } },
      isLoading: false,
    });
    render(<MemoryRecapCard tripId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: /Regenerate recap/i }));
    expect(generateMutateAsync).toHaveBeenCalledWith({ refresh: true });
  });
});
