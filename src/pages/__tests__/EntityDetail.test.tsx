/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(
  () =>
    ({ venue: null }) as {
      venue: { venue: null; reviews: never[]; notFound: boolean } | null;
    },
);

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useTrackEvent', () => ({ useTrackEvent: () => ({ track: vi.fn() }) }));
vi.mock('@/hooks/useEntityTripStatus', () => ({
  useEntityTripStatus: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/hooks/useVenueSocialSignals', () => ({ useVenueSocialSignals: () => ({ data: null }) }));
vi.mock('@/hooks/useEvents', () => ({
  useEvents: () => ({ events: [], loading: false, fetchEvents: vi.fn() }),
}));
const useMeta = vi.fn();
vi.mock('@/hooks/useMeta', () => ({ useMeta: (o: unknown) => useMeta(o) }));
// Only overrides `fetchVenue`; everything else the adapter imports from this
// module (the JSX-building helpers) passes through untouched.
vi.mock('@/pages/VenueDetail.parts', async (orig) => {
  const actual = await orig<typeof import('../VenueDetail.parts')>();
  return {
    ...actual,
    fetchVenue: () =>
      state.venue ? Promise.resolve(state.venue) : Promise.resolve({ venue: null, reviews: [] }),
  };
});
// The sign-in gate GatedDetailFallback shows for a gated country needs a real
// `useAuth`/RPC round trip this suite has no provider for. That machinery is
// irrelevant to the meta assertions below — `useDetailMeta` runs above the
// conditional return that mounts this component, so a trivial stub still
// exercises the fix.
vi.mock('@/components/safety/GatedDetailFallback', () => ({
  GatedDetailFallback: ({ notFound }: { notFound: React.ReactNode }) => <>{notFound}</>,
}));

import EntityDetail from '../EntityDetail';

function renderAt(path: string, routePath: string, element: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('EntityDetail', () => {
  beforeEach(() => {
    useMeta.mockClear();
    state.venue = null;
  });

  it('renders the venue source without crashing', () => {
    const { container } = renderAt('/venues/v1', '/venues/:slug', <EntityDetail source="venue" />);
    expect(container).toBeTruthy();
  });

  it('renders the organization source without crashing', () => {
    const { container } = renderAt(
      '/organizations/o1',
      '/organizations/:slug',
      <EntityDetail source="organization" />,
    );
    expect(container).toBeTruthy();
  });

  it('noindexes a venue slug that resolves to notFound', async () => {
    // `useMeta(descriptor?.meta ?? {})` used to be the ONLY call for this
    // page, and `descriptor` is null while not-found — so a dead venue slug
    // published `{}` (default title, self-referential canonical, no robots
    // tag) despite `NotFoundMeta` also being mounted deeper in the tree: a
    // parent effect commits after its children's, so it silently clobbered
    // whatever `NotFoundMeta` had just set. `useDetailMeta` now owns the
    // decision at the same level as the conditional return, independent of
    // effect ordering.
    state.venue = { venue: null, reviews: [], notFound: true };
    renderAt('/venues/dead-slug', '/venues/:slug', <EntityDetail source="venue" />);
    await waitFor(() => {
      const last = useMeta.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(last?.noIndex).toBe(true);
    });
    const last = useMeta.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(last?.title).toBe('Venue not found');
  });
});
