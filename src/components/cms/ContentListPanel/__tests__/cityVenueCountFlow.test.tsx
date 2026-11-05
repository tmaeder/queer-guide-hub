/**
 * @vitest-environment jsdom
 *
 * A place's venue count must open a list of exactly that place's venues.
 *
 * Venues are organisation locations and `/admin/content/venues` redirects to
 * the Organisations list. The count links used to carry `?city_id=`, a venue
 * column Organisations does not have, so `normalizeSpec` dropped the filter and
 * "1 venue" opened every organisation. This drives the REAL controller (only
 * the Supabase client is stubbed) and asserts on the query it sends — the
 * older `urlFilterDeepLink` test mocks the controller and could not see that.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';

type Call = { table: string; ops: Array<[string, unknown[]]> };
const rec = vi.hoisted(() => ({ calls: [] as Call[] }));

vi.mock('@/integrations/supabase/client', () => {
  const make = (table: string) => {
    const call: Call = { table, ops: [] };
    rec.calls.push(call);
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop: string) {
        if (prop === 'then') {
          const rows =
            table === 'cities'
              ? [
                  {
                    id: 'city-1',
                    name: 'Tinytown',
                    updated_at: '2026-10-01T00:00:00Z',
                    venues: [{ count: 1 }],
                    events: [{ count: 0 }],
                  },
                ]
              : [];
          return (res: (v: unknown) => unknown) =>
            Promise.resolve({ data: rows, error: null, count: rows.length }).then(res);
        }
        return (...args: unknown[]) => {
          call.ops.push([prop, args]);
          return proxy;
        };
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return proxy;
  };
  return {
    supabase: {
      from: (t: string) => make(t),
      rpc: () => Promise.resolve({ data: null, error: null }),
      auth: {
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
  };
});

import { ContentListPanel } from '../index';

const loc = { path: '' };
const setPath = (p: string) => {
  loc.path = p;
};
function Probe({ onPath }: { onPath: (p: string) => void }) {
  onPath(useLocation().pathname);
  return null;
}

const renderApp = (entry: string) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[entry]}>
        <TooltipProvider>
          <Probe onPath={setPath} />
          <Routes>
            <Route path="/admin/content/:type" element={<ContentListPanel />} />
          </Routes>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

/** The paginated list query (the one asking for a count), not option lookups. */
const orgListQueries = () =>
  rec.calls.filter(
    (c) =>
      c.table === 'organizations' &&
      c.ops.some(([op, a]) => op === 'select' && (a[1] as { count?: string })?.count === 'exact'),
  );

const ALIAS: Record<string, string> = {
  city_id: 'ef_venue_city_id',
  country_id: 'ef_venue_country_id',
  queer_village_id: 'ef_venue_village_id',
};

function expectFilteredToVenuePlace(column: string, value: string) {
  const q = orgListQueries().at(-1);
  expect(q).toBeDefined();
  const alias = ALIAS[column];
  const select = q!.ops.find(([op]) => op === 'select')![1][0] as string;
  expect(select).toContain(`${alias}:venues!venues_organization_id_fkey!inner(${column})`);
  expect(q!.ops).toContainEqual(['eq', [`${alias}.${column}`, value]]);
  // A merged-away or archived venue must not make its organisation match.
  expect(q!.ops).toContainEqual(['is', [`${alias}.duplicate_of_id`, null]]);
  expect(q!.ops).toContainEqual([
    'or',
    ['review_status.is.null,review_status.neq.archived', { referencedTable: alias }],
  ]);
}

describe('place venue count → organisations with a venue there (real controller)', () => {
  beforeEach(() => {
    rec.calls = [];
    loc.path = '';
    sessionStorage.clear();
  });

  it('clicking the Cities venue count filters Organisations to that city', async () => {
    renderApp('/admin/content/cities');
    const link = await screen.findByRole('link', { name: /Show 1 venues in Tinytown/i });
    fireEvent.click(link);
    await waitFor(() => expect(loc.path).toBe('/admin/content/organizations'));
    await waitFor(() => expectFilteredToVenuePlace('city_id', 'city-1'));
    expect(await screen.findByText(/Venue city is Tinytown/)).toBeTruthy();
  });

  it.each([
    ['venue_city_id', 'city_id'],
    ['venue_country_id', 'country_id'],
    ['venue_village_id', 'queer_village_id'],
  ])('honours ?%s=', async (param, column) => {
    renderApp(`/admin/content/organizations?${param}=place-1&${param}_label=Somewhere`);
    await waitFor(() => expectFilteredToVenuePlace(column, 'place-1'));
  });

  it('translates an old /admin/content/venues?city_id= link instead of dropping it', async () => {
    renderApp('/admin/content/venues?city_id=city-1&city_id_label=Tinytown');
    await waitFor(() => expect(loc.path).toBe('/admin/content/organizations'));
    await waitFor(() => expectFilteredToVenuePlace('city_id', 'city-1'));
  });
});
