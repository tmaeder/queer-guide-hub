/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const { useTripDocsMock } = vi.hoisted(() => ({ useTripDocsMock: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, optsOrDefault?: string | Record<string, unknown>) => {
      if (typeof optsOrDefault === 'string') return optsOrDefault;
      return (optsOrDefault as { defaultValue?: string } | undefined)?.defaultValue ?? _k;
    },
  }),
}));
vi.mock('@/hooks/useTripDocuments', () => ({ useTripDocuments: useTripDocsMock }));

import { TripDocExpiryBanner, __testing } from '../TripDocExpiryBanner';

const inRouter = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;

const trip = {
  id: 't1',
  start_date: '2026-06-01',
  end_date: '2026-06-10',
} as never;

beforeEach(() => useTripDocsMock.mockReset());

describe('TripDocExpiryBanner.flagDocs', () => {
  it('returns [] when trip lacks dates', () => {
    expect(__testing.flagDocs([], { id: 't', start_date: null, end_date: null } as never, new Date())).toEqual([]);
  });

  it('flags expired docs as expired', () => {
    const flags = __testing.flagDocs(
      [{ id: 'd1', title: 'PP', doc_type: 'passport', expiry_date: '2025-01-01' } as never],
      trip,
      new Date('2026-05-15'),
    );
    expect(flags[0].level).toBe('expired');
  });

  it('flags passports needing 6-month buffer as soon', () => {
    const flags = __testing.flagDocs(
      [{ id: 'd1', title: 'PP', doc_type: 'passport', expiry_date: '2026-08-01' } as never],
      trip,
      new Date('2026-05-15'),
    );
    expect(flags[0].level).toBe('soon');
  });

  it('does not flag passports valid through buffer window', () => {
    const flags = __testing.flagDocs(
      [{ id: 'd1', title: 'PP', doc_type: 'passport', expiry_date: '2027-06-01' } as never],
      trip,
      new Date('2026-05-15'),
    );
    expect(flags).toEqual([]);
  });
});

describe('TripDocExpiryBanner UI', () => {
  it('renders nothing when no flags', () => {
    useTripDocsMock.mockReturnValue({ data: [] });
    const { container } = render(inRouter(<TripDocExpiryBanner trip={trip} />));
    expect(container.firstChild).toBeNull();
  });

  it('shows expired title when any doc is expired', () => {
    useTripDocsMock.mockReturnValueOnce({ data: [
      { id: 'd1', title: 'Passport', doc_type: 'passport', expiry_date: '2020-01-01' },
    ] });
    useTripDocsMock.mockReturnValueOnce({ data: [] });
    render(inRouter(<TripDocExpiryBanner trip={trip} />));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Document expired/i)).toBeInTheDocument();
  });
});
