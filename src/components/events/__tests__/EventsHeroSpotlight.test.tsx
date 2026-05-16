/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useSpotlightMock } = vi.hoisted(() => ({ useSpotlightMock: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, optsOrDefault?: string | Record<string, unknown>) => {
      if (typeof optsOrDefault === 'string') return optsOrDefault;
      const def = (optsOrDefault as { defaultValue?: string } | undefined)?.defaultValue ?? k;
      return def;
    },
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/i18n/dateFnsLocale', () => ({ dateFnsLocaleFor: () => undefined }));
vi.mock('@/hooks/useEventSpotlight', () => ({ useEventSpotlight: useSpotlightMock }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

import { EventsHeroSpotlight } from '../EventsHeroSpotlight';

const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000 + 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();

beforeEach(() => useSpotlightMock.mockReset());

describe('EventsHeroSpotlight', () => {
  it('returns null when no spotlight', () => {
    useSpotlightMock.mockReturnValue({ spotlight: null });
    const { container } = render(<EventsHeroSpotlight />);
    expect(container.firstChild).toBeNull();
  });

  it('renders event title and Starts in N days countdown for future event', () => {
    useSpotlightMock.mockReturnValue({
      spotlight: {
        event: { slug: 's', title: 'Pride Parade', start_date: futureDate, end_date: null, city: 'Berlin' },
        clusterCount: 1,
      },
    });
    render(<EventsHeroSpotlight />);
    expect(screen.getByText('Pride Parade')).toBeInTheDocument();
    expect(screen.getByText(/Starts in/i)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/events/s');
  });

  it('shows tomorrow countdown when event is 1 day away', () => {
    useSpotlightMock.mockReturnValue({
      spotlight: { event: { slug: 's', title: 'X', start_date: tomorrow, end_date: null, city: null }, clusterCount: 0 },
    });
    render(<EventsHeroSpotlight />);
    expect(screen.getByText(/Starts tomorrow/i)).toBeInTheDocument();
  });

  it('shows happening-now copy for past/today events', () => {
    useSpotlightMock.mockReturnValue({
      spotlight: { event: { slug: 's', title: 'X', start_date: past, end_date: null, city: null }, clusterCount: 0 },
    });
    render(<EventsHeroSpotlight />);
    expect(screen.getByText(/Happening now/i)).toBeInTheDocument();
  });

  it('shows cluster size when clusterCount > 1 and city set', () => {
    useSpotlightMock.mockReturnValue({
      spotlight: { event: { slug: 's', title: 'X', start_date: futureDate, end_date: null, city: 'Berlin' }, clusterCount: 4 },
    });
    render(<EventsHeroSpotlight />);
    expect(screen.getByText(/4 events in Berlin/i)).toBeInTheDocument();
  });
});
