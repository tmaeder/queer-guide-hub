/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const { useNudgesMock, useDismissMock, dismissMutate } = vi.hoisted(() => ({
  useNudgesMock: vi.fn(),
  useDismissMock: vi.fn(),
  dismissMutate: vi.fn(),
}));

vi.mock('@/hooks/useTripNudges', () => ({
  useTripNudges: useNudgesMock,
  useDismissTripNudge: useDismissMock,
}));

import { TripNudgesBanner } from '../TripNudgesBanner';

const inRouter = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;

beforeEach(() => {
  useNudgesMock.mockReset();
  useDismissMock.mockReset();
  dismissMutate.mockReset();
  useDismissMock.mockReturnValue({ mutate: dismissMutate, isPending: false });
});

describe('TripNudgesBanner', () => {
  it('renders nothing while loading', () => {
    useNudgesMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(inRouter(<TripNudgesBanner tripId="t1" />));
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when nudge list empty', () => {
    useNudgesMock.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(inRouter(<TripNudgesBanner tripId="t1" />));
    expect(container.firstChild).toBeNull();
  });

  it('renders title + body for each nudge', () => {
    useNudgesMock.mockReturnValue({
      data: [
        { id: 'n1', kind: 'event_overlap', severity: 'info', title: 'Hello', body: 'World' },
      ],
      isLoading: false,
    });
    render(inRouter(<TripNudgesBanner tripId="t1" />));
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('World')).toBeInTheDocument();
  });

  it('renders external link with target=_blank for non-internal action_url', () => {
    useNudgesMock.mockReturnValue({
      data: [
        { id: 'n1', kind: 'news_alert', severity: 'info', title: 'T', body: null, action_url: 'https://x.com', action_label: 'Visit' },
      ],
      isLoading: false,
    });
    render(inRouter(<TripNudgesBanner tripId="t1" />));
    const link = screen.getByRole('link', { name: /Visit/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('href', 'https://x.com');
  });

  it('renders router link for internal action_url', () => {
    useNudgesMock.mockReturnValue({
      data: [
        { id: 'n1', kind: 'news_alert', severity: 'info', title: 'T', body: null, action_url: '/trips/foo', action_label: 'Open' },
      ],
      isLoading: false,
    });
    render(inRouter(<TripNudgesBanner tripId="t1" />));
    const link = screen.getByRole('link', { name: /Open/i });
    expect(link).not.toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('href', '/trips/foo');
  });

  it('Dismiss button fires mutation with id + tripId', () => {
    useNudgesMock.mockReturnValue({
      data: [{ id: 'n1', kind: 'event_overlap', severity: 'info', title: 'T', body: null }],
      isLoading: false,
    });
    render(inRouter(<TripNudgesBanner tripId="t1" />));
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));
    expect(dismissMutate).toHaveBeenCalledWith({ id: 'n1', tripId: 't1' });
  });

  it('uses AlertTriangle icon for critical severity', () => {
    useNudgesMock.mockReturnValue({
      data: [{ id: 'n1', kind: 'event_overlap', severity: 'critical', title: 'Critical!', body: null }],
      isLoading: false,
    });
    const { container } = render(inRouter(<TripNudgesBanner tripId="t1" />));
    expect(container.querySelector('svg.lucide-alert-triangle, svg.lucide-triangle-alert')).not.toBeNull();
  });
});
