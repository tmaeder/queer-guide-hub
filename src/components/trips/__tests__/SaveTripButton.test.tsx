/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useAuthMock, useMyTripSavesMock, useToggleTripSaveMock, useToastMock, navigateFn, toggleMutate, toastFn } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useMyTripSavesMock: vi.fn(),
  useToggleTripSaveMock: vi.fn(),
  useToastMock: vi.fn(),
  navigateFn: vi.fn(),
  toggleMutate: vi.fn(),
  toastFn: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigateFn }));
vi.mock('@/hooks/useTripSaves', () => ({
  useMyTripSaves: useMyTripSavesMock,
  useToggleTripSave: useToggleTripSaveMock,
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));

import { SaveTripButton } from '../SaveTripButton';

beforeEach(() => {
  navigateFn.mockReset();
  toggleMutate.mockReset();
  toastFn.mockReset();
  useAuthMock.mockReset();
  useMyTripSavesMock.mockReset();
  useToggleTripSaveMock.mockReset();
  useToastMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
  useMyTripSavesMock.mockReturnValue({ data: new Set() });
  useToggleTripSaveMock.mockReturnValue({ mutate: toggleMutate, isPending: false });
  useToastMock.mockReturnValue({ toast: toastFn });
});

describe('SaveTripButton', () => {
  it('renders Save when not yet saved', () => {
    render(<SaveTripButton tripId="t1" />);
    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
  });

  it('renders Saved when in saved set', () => {
    useMyTripSavesMock.mockReturnValue({ data: new Set(['t1']) });
    render(<SaveTripButton tripId="t1" />);
    expect(screen.getByRole('button', { name: /Saved/i })).toBeInTheDocument();
  });

  it('redirects to /auth when clicked while signed-out', () => {
    useAuthMock.mockReturnValue({ user: null });
    render(<SaveTripButton tripId="t1" />);
    fireEvent.click(screen.getByRole('button'));
    expect(navigateFn).toHaveBeenCalledWith('/auth');
    expect(toggleMutate).not.toHaveBeenCalled();
  });

  it('toggles save on click', () => {
    render(<SaveTripButton tripId="t1" />);
    fireEvent.click(screen.getByRole('button'));
    expect(toggleMutate).toHaveBeenCalledWith(
      { tripId: 't1', saved: false },
      expect.any(Object),
    );
  });

  it('compact variant renders icon-only with aria-label', () => {
    render(<SaveTripButton tripId="t1" compact />);
    expect(screen.getByRole('button', { name: /Save trip/i })).toBeInTheDocument();
  });

  it('is disabled while the mutation is pending', () => {
    useToggleTripSaveMock.mockReturnValue({ mutate: toggleMutate, isPending: true });
    render(<SaveTripButton tripId="t1" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
