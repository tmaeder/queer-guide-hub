// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { update } = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedSupabase: { functions: { invoke: vi.fn() } },
  untypedFrom: (table: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      order: async () => ({
        data:
          table === 'guide_picks'
            ? [
                {
                  id: 'p1',
                  entity_type: 'venue',
                  entity_id: 'v1',
                  tier: 'top',
                  rationale_md: 'A sourced recommendation with explicit practical limitations.',
                  pros: [],
                  cons: [],
                  position: 0,
                  is_orphaned: false,
                  source_urls: ['https://example.com'],
                  verified_at: '2026-10-30T22:38:02.241495+00:00',
                },
              ]
            : [],
        error: null,
      }),
      in: async () => ({ data: [{ id: 'v1', name: 'A venue' }], error: null }),
      update: (patch: unknown) => {
        update(patch);
        return { eq: async () => ({ error: null }) };
      },
    };
    return q;
  },
}));
import { GuidePicksPanel } from '../GuidePicksPanel';
function open() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GuidePicksPanel guideId="g1" />
    </QueryClientProvider>,
  );
}
describe('source verification dates', () => {
  beforeEach(() => update.mockClear());
  it('does not write or reopen review when an unchanged calendar date loses focus', async () => {
    open();
    const field = await screen.findByLabelText('Sources checked on');
    expect(field).toHaveValue('2026-10-30');
    fireEvent.blur(field);
    expect(update).not.toHaveBeenCalled();
  });
  it('persists a deliberately changed verification date', async () => {
    open();
    const field = await screen.findByLabelText('Sources checked on');
    fireEvent.change(field, { target: { value: '2026-10-29' } });
    fireEvent.blur(field);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ verified_at: '2026-10-29T00:00:00.000Z' }),
    );
  });
});
