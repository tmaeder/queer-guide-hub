import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventProgrammePanel } from '@/components/admin/events/EventProgrammePanel';

/**
 * The panel is admin-gated, so a browser check needs a session. These assert the two
 * behaviours that are easy to get wrong and invisible until an editor hits them:
 *
 *  - `event_programme()` resolves EITHER side to the same root, so a child and its
 *    umbrella return identical payloads. Without the isChild split the panel looks the
 *    same from both ends and offers an editor the wrong action.
 *  - The depth guard lives in the database. Its refusal has to REACH the editor; a
 *    mutation that swallows the error leaves the UI showing a link that was rejected.
 */

const rpc = vi.fn();
const update = vi.fn();
const eq = vi.fn();

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedSupabase: { rpc: (...a: unknown[]) => rpc(...a) },
  untypedFrom: () => ({ update: (...a: unknown[]) => update(...a) }),
}));

const toastSpy = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (...a: unknown[]) => toastSpy(...a) }));

const UMBRELLA = {
  id: 'umbrella-1',
  title: 'lila Queer Festival',
  start_date: '2026-09-10T04:00:00Z',
  end_date: '2026-09-13T03:59:59Z',
};
const CHILD = {
  id: 'child-1',
  slug: 'lila-donnerstag',
  title: 'lila. 26 — Donnerstag',
  start_date: '2026-09-10T16:00:00Z',
  venue_name: 'Rote Fabrik',
};

function mountPanel(eventId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EventProgrammePanel eventId={eventId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpc.mockReset();
  update.mockReset();
  eq.mockReset();
  toastSpy.mockReset();
  update.mockReturnValue({ eq: (...a: unknown[]) => eq(...a) });
  eq.mockResolvedValue({ error: null });
});

describe('EventProgrammePanel', () => {
  it('lists the children when opened on the umbrella', async () => {
    rpc.mockImplementation((fn: string) =>
      fn === 'event_programme'
        ? Promise.resolve({ data: { umbrella: UMBRELLA, children: [CHILD] }, error: null })
        : Promise.resolve({ data: [], error: null }),
    );

    mountPanel('umbrella-1');

    expect(await screen.findByText('lila. 26 — Donnerstag')).toBeInTheDocument();
    expect(screen.getByText(/Programme \(1\)/)).toBeInTheDocument();
    // On the umbrella there is nothing to detach FROM.
    expect(screen.queryByText(/Detach from/)).not.toBeInTheDocument();
  });

  it('tells the editor they are on a child, not the umbrella', async () => {
    // Same payload as above — the RPC resolves both sides to the root. Only the id
    // the panel was opened with distinguishes them.
    rpc.mockImplementation((fn: string) =>
      fn === 'event_programme'
        ? Promise.resolve({ data: { umbrella: UMBRELLA, children: [CHILD] }, error: null })
        : Promise.resolve({ data: [], error: null }),
    );

    mountPanel('child-1');

    expect(await screen.findByText(/Detach from lila Queer Festival/)).toBeInTheDocument();
    // A child cannot adopt, so suggestions must not be offered.
    expect(screen.queryByText('Suggested')).not.toBeInTheDocument();
  });

  it('does not ask for suggestions when opened on a child', async () => {
    rpc.mockImplementation((fn: string) =>
      fn === 'event_programme'
        ? Promise.resolve({ data: { umbrella: UMBRELLA, children: [CHILD] }, error: null })
        : Promise.resolve({ data: [], error: null }),
    );

    mountPanel('child-1');
    await screen.findByText(/Detach from/);

    expect(rpc.mock.calls.some(([fn]) => fn === 'event_programme_candidates')).toBe(false);
  });

  it('attaches a suggestion to the umbrella', async () => {
    rpc.mockImplementation((fn: string) =>
      fn === 'event_programme'
        ? Promise.resolve({ data: { umbrella: UMBRELLA, children: [] }, error: null })
        : Promise.resolve({
            data: [
              {
                id: 'cand-9',
                slug: 'drag-brunch',
                title: 'Drag Brunch',
                start_date: '2026-09-12T09:30:00Z',
                venue_name: 'Hive',
              },
            ],
            error: null,
          }),
    );

    mountPanel('umbrella-1');
    await userEvent.click(await screen.findByRole('button', { name: /Attach/ }));

    await waitFor(() => expect(update).toHaveBeenCalledWith({ parent_event_id: 'umbrella-1' }));
    expect(eq).toHaveBeenCalledWith('id', 'cand-9');
  });

  it("surfaces the database's refusal instead of swallowing it", async () => {
    rpc.mockImplementation((fn: string) =>
      fn === 'event_programme'
        ? Promise.resolve({ data: { umbrella: UMBRELLA, children: [CHILD] }, error: null })
        : Promise.resolve({ data: [], error: null }),
    );
    eq.mockResolvedValue({
      error: new Error('events cannot be nested more than one level deep'),
    });

    mountPanel('umbrella-1');
    await userEvent.click(await screen.findByRole('button', { name: /Detach/ }));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const [arg] = toastSpy.mock.calls[0] as [{ description?: string; variant?: string }];
    expect(arg.description).toMatch(/one level deep/);
    expect(arg.variant).toBe('destructive');
  });

  it('prints no time for a midnight start rather than inventing one', async () => {
    // NOT a scan for "00:00": toLocaleTimeString with hour:'2-digit' renders midnight
    // as "12:00 AM" under the test locale, so that regex never matches in either
    // direction and the assertion passes on broken code. Mutation-tested — it did.
    // The separator is the tell: whenLabel only emits " · " when it emits a time, and
    // venue_name is null here so nothing else can add one.
    rpc.mockImplementation((fn: string) =>
      fn === 'event_programme'
        ? Promise.resolve({
            data: {
              umbrella: UMBRELLA,
              children: [
                {
                  ...CHILD,
                  title: 'All-day thing',
                  venue_name: null,
                  start_date: '2026-09-11T00:00:00',
                },
              ],
            },
            error: null,
          })
        : Promise.resolve({ data: [], error: null }),
    );

    mountPanel('umbrella-1');
    const row = (await screen.findByText('All-day thing')).closest('li');
    expect(row).not.toBeNull();
    expect(row!.textContent).not.toContain('·');
  });

  it('does print a time when there is a real one', async () => {
    // Positive control for the test above: without this, "no separator" also passes
    // on a whenLabel that never renders a time at all.
    rpc.mockImplementation((fn: string) =>
      fn === 'event_programme'
        ? Promise.resolve({
            data: {
              umbrella: UMBRELLA,
              children: [
                {
                  ...CHILD,
                  title: 'Evening thing',
                  venue_name: null,
                  start_date: '2026-09-11T19:30:00',
                },
              ],
            },
            error: null,
          })
        : Promise.resolve({ data: [], error: null }),
    );

    mountPanel('umbrella-1');
    const row = (await screen.findByText('Evening thing')).closest('li');
    expect(row!.textContent).toContain('·');
  });
});
