/**
 * @vitest-environment jsdom
 *
 * Regression for the prod crash measured in `community_submissions`
 * (content_type='api_error'): `[crash] Error @ /community` (2026-09-09) and
 * `[crash] Error @ /community/feed` (2026-09-08), both
 * "WebSocket not available: Failed to construct 'WebSocket': Failed to create a
 * WebSocket: the provided URL is invalid."
 *
 * The chunk hashes differed between the two occurrences (Feed-gauXXqLX vs
 * Feed-CaCK0X7h), so this is a live code path, not a stale bundle.
 *
 * Unlike `Feed.test.tsx`, this exercises the REAL `useCommunityPosts` so the
 * realtime subscription actually runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const captureException = vi.fn();
vi.mock('@sentry/react', () => ({ captureException: (...a: unknown[]) => captureException(...a) }));

const PROD_MESSAGE =
  "WebSocket not available: Failed to construct 'WebSocket': Failed to create a WebSocket: the provided URL is invalid.";

const subscribeAttempts = vi.fn();
const removeChannel = vi.fn();

// Stable object identities across renders — an unstable mock ref has OOM'd CI
// in this repo before.
const queryBuilder: Record<string, unknown> = {};
for (const method of ['select', 'order', 'range', 'eq', 'in', 'insert', 'delete', 'single']) {
  queryBuilder[method] = () => queryBuilder;
}
queryBuilder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
  Promise.resolve({ data: [], error: null }).then(resolve, reject);

const channel: Record<string, unknown> = {
  on: () => channel,
  subscribe: () => {
    subscribeAttempts();
    // Exactly what realtime-js rethrows when the WebSocket constructor refuses.
    throw new Error(PROD_MESSAGE);
  },
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => queryBuilder,
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => channel,
    removeChannel: (...a: unknown[]) => removeChannel(...a),
  },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/posts/PostCard', () => ({ PostCard: () => null }));
vi.mock('@/components/posts/CreatePostDialog', () => ({ CreatePostDialog: () => null }));
vi.mock('@/components/tags/FollowedTagsFeed', () => ({ FollowedTagsFeed: () => null }));

import Feed from '../Feed';

/** Records anything that escapes Feed, standing in for the app error boundary. */
class CatchingBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(_e: Error, _i: ErrorInfo) {
    /* recorded via state */
  }
  render() {
    if (this.state.error) return <div data-testid="boundary">{this.state.error.message}</div>;
    return this.props.children;
  }
}

const renderFeed = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <CatchingBoundary>
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Feed />
        </MemoryRouter>
      </QueryClientProvider>
    </CatchingBoundary>,
  );
};

describe('Feed — realtime transport failure', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureException.mockClear();
    subscribeAttempts.mockClear();
    removeChannel.mockClear();
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renders the feed when the realtime socket cannot be constructed', async () => {
    renderFeed();

    // Positive control: the subscription really was attempted, so a passing
    // assertion below cannot come from the realtime path being skipped.
    await waitFor(() => expect(subscribeAttempts).toHaveBeenCalled());

    expect(screen.queryByTestId('boundary')).toBeNull();
    // Feed content is on screen — degraded to non-live, not replaced.
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Search posts or users...')).toBeTruthy(),
    );
  });

  it('reports the transport failure instead of silently dropping it', async () => {
    renderFeed();
    await waitFor(() => expect(captureException).toHaveBeenCalled());

    const [error, options] = captureException.mock.calls[0] as [
      Error,
      { tags: Record<string, string> },
    ];
    expect(error.message).toBe(PROD_MESSAGE);
    expect(options.tags.subsystem).toBe('realtime');
    expect(options.tags.realtime_context).toBe('useCommunityPosts');
  });

  it('does not try to remove a channel that never opened', async () => {
    const { unmount } = renderFeed();
    await waitFor(() => expect(subscribeAttempts).toHaveBeenCalled());
    unmount();
    expect(removeChannel).not.toHaveBeenCalled();
  });
});
