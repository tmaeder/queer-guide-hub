/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { navigateFn, useAuthMock } = vi.hoisted(() => ({
  navigateFn: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigateFn }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/config/submissionRegistry', () => ({
  submissionTypes: [
    { id: 'venue', label: 'Venue', description: 'desc', icon: () => null, color: '#000' },
    { id: 'event', label: 'Event', description: 'desc', icon: () => null, color: '#000' },
  ],
}));

import SubmitHub from '../SubmitHub';

beforeEach(() => {
  navigateFn.mockReset();
  useAuthMock.mockReset();
});

describe('SubmitHub', () => {
  it('renders sign-in tip when signed-out', () => {
    useAuthMock.mockReturnValue({ user: null });
    render(<SubmitHub />);
    expect(screen.getByText(/Sign in or create an account/)).toBeInTheDocument();
  });

  it('hides tip when signed-in', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    render(<SubmitHub />);
    expect(screen.queryByText(/Sign in or create/)).toBeNull();
  });

  it('Scan Flyer card navigates to event scan', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    render(<SubmitHub />);
    fireEvent.click(screen.getByText(/Scan a Flyer/).closest('[class*="cursor"], .cursor-pointer') ?? screen.getByText(/Scan a Flyer/));
    expect(navigateFn).toHaveBeenCalledWith('/submit/event?mode=scan');
  });

  it('renders one card per submission type', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    render(<SubmitHub />);
    expect(screen.getByText(/Submit Venue/)).toBeInTheDocument();
    expect(screen.getByText(/Submit Event/)).toBeInTheDocument();
  });
});
