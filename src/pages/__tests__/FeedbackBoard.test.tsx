/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(() => ({
  fetch: vi.fn(),
  toggle: vi.fn(),
  toast: vi.fn(),
  user: null as { id: string } | null,
}));

vi.mock('@/hooks/useFeedbackVote', () => ({ useFeedbackVoteCounts: () => ({ data: {} }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/hooks/usePageFetchers', () => ({
  fetchFeedbackBoardItems: state.fetch,
  toggleFeedbackVote: state.toggle,
}));

import FeedbackBoard from '../FeedbackBoard';

const item = (id: string, status: string, title: string) => ({
  id,
  data: { title, description: `${title} details`, category: 'idea' },
  submitted_at: '2026-11-01T10:00:00Z',
  feedback_status: status,
  vote_count: 2,
});

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname + loc.search}</output>;
}

function renderBoard(path = '/feedback') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/feedback" element={<FeedbackBoard />} />
          <Route path="*" element={null} />
        </Routes>
        <Where />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.user = null;
});

describe('FeedbackBoard', () => {
  it('shows one actionable empty state instead of five empty columns', async () => {
    state.fetch.mockResolvedValue([]);
    renderBoard();
    expect(await screen.findByText('No feedback yet.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Send feedback' })).toHaveLength(1);
    expect(screen.queryByText('Under Review')).toBeNull();
  });

  it('tells a failed load apart from an empty board', async () => {
    state.fetch.mockRejectedValue(new Error('network'));
    renderBoard();
    expect(await screen.findByText('The feedback board did not load')).toBeTruthy();
    expect(screen.queryByText('No feedback yet.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('opens an item from ?item= so it can be shared', async () => {
    state.fetch.mockResolvedValue([item('a', 'new', 'Dark map'), item('b', 'done', 'Fix login')]);
    renderBoard('/feedback?item=b');
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Fix login' })).toBeTruthy();
  });

  it('filters by status', async () => {
    state.fetch.mockResolvedValue([item('a', 'new', 'Dark map'), item('b', 'done', 'Fix login')]);
    renderBoard();
    await screen.findByText('Dark map');
    fireEvent.click(screen.getByRole('button', { name: /^Done/ }));
    expect(screen.queryByText('Dark map')).toBeNull();
    expect(screen.getByText('Fix login')).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe('/feedback?status=done');
  });

  it('sends a signed-out voter to sign in and back to the item', async () => {
    state.fetch.mockResolvedValue([item('a', 'new', 'Dark map')]);
    renderBoard('/feedback?item=a');
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /2 votes/ }));
    expect(screen.getByTestId('where').textContent).toBe(
      `/auth?redirect=${encodeURIComponent('/feedback?item=a')}`,
    );
  });

  it('says so when a vote fails', async () => {
    state.user = { id: 'u1' };
    state.fetch.mockResolvedValue([item('a', 'new', 'Dark map')]);
    state.toggle.mockRejectedValue(new Error('denied'));
    renderBoard('/feedback?item=a');
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /2 votes/ }));
    await vi.waitFor(() =>
      expect(state.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Your vote did not save' }),
      ),
    );
  });
});
