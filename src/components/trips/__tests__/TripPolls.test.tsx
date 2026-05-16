/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useAuthMock, useToastMock, useTripPollsMock, createMutate, voteMutate, closeMutate } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useToastMock: vi.fn(),
  useTripPollsMock: vi.fn(),
  createMutate: vi.fn(),
  voteMutate: vi.fn(),
  closeMutate: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, optsOrDefault?: string | Record<string, unknown>) => {
      if (typeof optsOrDefault === 'string') return optsOrDefault;
      return (optsOrDefault as { defaultValue?: string } | undefined)?.defaultValue ?? _k;
    },
  }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/hooks/useTripCollaboration', () => ({ useTripPolls: useTripPollsMock }));
vi.mock('@/components/animation/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/layout/PageLoadingState', () => ({
  PageLoadingState: () => <div data-testid="loading" />,
}));

import { TripPolls } from '../TripPolls';

beforeEach(() => {
  useAuthMock.mockReset();
  useToastMock.mockReset();
  useTripPollsMock.mockReset();
  createMutate.mockReset();
  voteMutate.mockReset();
  closeMutate.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
  useToastMock.mockReturnValue({ toast: vi.fn() });
});

describe('TripPolls', () => {
  it('shows loading state', () => {
    useTripPollsMock.mockReturnValue({ data: undefined, isLoading: true, createPoll: { mutate: createMutate }, vote: { mutate: voteMutate }, closePoll: { mutate: closeMutate } });
    render(<TripPolls tripId="t1" />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows empty state with create CTA', () => {
    useTripPollsMock.mockReturnValue({ data: [], isLoading: false, createPoll: { mutate: createMutate }, vote: { mutate: voteMutate }, closePoll: { mutate: closeMutate } });
    render(<TripPolls tripId="t1" />);
    expect(screen.getByText(/No polls yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Poll/i })).toBeInTheDocument();
  });

  it('renders poll with question + options', () => {
    useTripPollsMock.mockReturnValue({
      data: [
        {
          id: 'p1',
          author_id: 'u2',
          question: 'Which city?',
          is_closed: false,
          is_multiple_choice: false,
          deadline: null,
          options: [
            { id: 'o1', text: 'Berlin', votes: ['u1'] },
            { id: 'o2', text: 'Hamburg', votes: [] },
          ],
        },
      ],
      isLoading: false,
      createPoll: { mutate: createMutate },
      vote: { mutate: voteMutate },
      closePoll: { mutate: closeMutate },
    });
    render(<TripPolls tripId="t1" />);
    expect(screen.getByText('Which city?')).toBeInTheDocument();
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('Hamburg')).toBeInTheDocument();
  });

  it('voting calls mutate', () => {
    useTripPollsMock.mockReturnValue({
      data: [
        {
          id: 'p1',
          author_id: 'u2',
          question: 'q',
          is_closed: false,
          is_multiple_choice: false,
          deadline: null,
          options: [{ id: 'o1', text: 'A', votes: [] }, { id: 'o2', text: 'B', votes: [] }],
        },
      ],
      isLoading: false,
      createPoll: { mutate: createMutate },
      vote: { mutate: voteMutate },
      closePoll: { mutate: closeMutate },
    });
    render(<TripPolls tripId="t1" />);
    fireEvent.click(screen.getByText('A'));
    expect(voteMutate).toHaveBeenCalledWith({ pollId: 'p1', optionId: 'o1' }, expect.any(Object));
  });

  it('author can close their own poll', () => {
    useTripPollsMock.mockReturnValue({
      data: [
        {
          id: 'p1',
          author_id: 'u1',
          question: 'q',
          is_closed: false,
          is_multiple_choice: false,
          deadline: null,
          options: [{ id: 'o1', text: 'A', votes: [] }, { id: 'o2', text: 'B', votes: [] }],
        },
      ],
      isLoading: false,
      createPoll: { mutate: createMutate },
      vote: { mutate: voteMutate },
      closePoll: { mutate: closeMutate },
    });
    render(<TripPolls tripId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: /Close Poll/i }));
    expect(closeMutate).toHaveBeenCalledWith('p1');
  });
});
