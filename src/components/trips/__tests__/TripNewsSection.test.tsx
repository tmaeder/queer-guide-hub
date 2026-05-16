/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useTripNewsMock } = vi.hoisted(() => ({ useTripNewsMock: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, optsOrDefault?: string | Record<string, unknown>) => {
      if (typeof optsOrDefault === 'string') return optsOrDefault;
      const def = (optsOrDefault as { defaultValue?: string } | undefined)?.defaultValue ?? _k;
      return def;
    },
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/hooks/useTripNews', () => ({ useTripNews: useTripNewsMock }));

import { TripNewsSection } from '../TripNewsSection';

beforeEach(() => useTripNewsMock.mockReset());

describe('TripNewsSection', () => {
  it('renders nothing when countryIds empty', () => {
    useTripNewsMock.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(<TripNewsSection countryIds={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders skeletons while loading', () => {
    useTripNewsMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<TripNewsSection countryIds={['c1']} />);
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it('shows empty message when no articles', () => {
    useTripNewsMock.mockReturnValue({ data: [], isLoading: false });
    render(<TripNewsSection countryIds={['c1']} />);
    expect(screen.getByText(/No recent news/i)).toBeInTheDocument();
  });

  it('renders articles + relative time + safety alert badge', () => {
    useTripNewsMock.mockReturnValue({
      data: [
        { id: 'a1', title: 'Pride parade attack', url: 'https://x/1', publisher_name: 'BBC', published_at: new Date(Date.now() - 60_000).toISOString(), isSafetyFlagged: true },
        { id: 'a2', title: 'New rainbow cafe', url: 'https://x/2', publisher_name: null, published_at: new Date(Date.now() - 60_000).toISOString(), isSafetyFlagged: false },
      ],
      isLoading: false,
    });
    render(<TripNewsSection countryIds={['c1']} />);
    expect(screen.getByText('Pride parade attack')).toBeInTheDocument();
    expect(screen.getByText('New rainbow cafe')).toBeInTheDocument();
    expect(screen.getByText(/safety alerts/i)).toBeInTheDocument();
  });

  it('article anchors have target=_blank', () => {
    useTripNewsMock.mockReturnValue({
      data: [{ id: 'a1', title: 'T', url: 'https://x', publisher_name: null, published_at: new Date().toISOString(), isSafetyFlagged: false }],
      isLoading: false,
    });
    render(<TripNewsSection countryIds={['c1']} />);
    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
  });
});
