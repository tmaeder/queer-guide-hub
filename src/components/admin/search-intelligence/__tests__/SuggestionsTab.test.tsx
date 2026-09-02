/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/useSearchIntelligence', () => ({
  callSearchIntelligence: vi.fn(),
  createTagFromProposal: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
  },
}));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => Promise.resolve({ data: [], error: null });
    return chain;
  },
}));

import { callSearchIntelligence, createTagFromProposal } from '@/hooks/useSearchIntelligence';
import { SuggestionsTab } from '../SuggestionsTab';

const callSi = vi.mocked(callSearchIntelligence);
const createTag = vi.mocked(createTagFromProposal);

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

/** The row shape source-tags-extract's buildProposalRow() files. */
function proposal(overrides: Record<string, unknown> = {}) {
  const { proposed_value: pv, ...rest } = overrides as {
    proposed_value?: Record<string, unknown>;
  } & Record<string, unknown>;
  return {
    id: 'sug-1',
    suggestion_type: 'tag',
    entity_type: 'tag',
    entity_id: null,
    locale: null,
    proposed_value: { name: 'Bühne', slug: 'buhne', seen_in: ['events'], ...(pv ?? {}) },
    current_value: null,
    source: 'rule',
    source_model: null,
    source_run_id: 'run-1',
    confidence: null,
    status: 'pending',
    reviewer_id: null,
    review_notes: null,
    approved_at: null,
    applied_at: null,
    rejected_at: null,
    expires_at: null,
    created_at: '2026-09-01T00:00:00Z',
    ...rest,
  };
}

/** Serve one list response, then let PATCHes resolve. */
function serve(rows: unknown[]) {
  callSi.mockImplementation(async (path: string) => {
    if (path === 'suggestions') return { success: true, data: rows } as never;
    return { success: true, data: {} } as never;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SuggestionsTab', () => {
  it('renders without crashing', () => {
    serve([]);
    const { container } = render(<SuggestionsTab />, { wrapper });
    expect(container).toBeTruthy();
  });

  it('renders a null-entity tag proposal by name, with slug and seen_in', async () => {
    serve([proposal({ proposed_value: { seen_in: ['events', 'venues'] } })]);
    render(<SuggestionsTab />, { wrapper });

    expect(await screen.findByTestId('tag-proposal-name')).toHaveTextContent('Bühne');
    // slug + provenance are secondary context, not the subject.
    expect(screen.getByText(/buhne/)).toBeInTheDocument();
    expect(screen.getByText(/seen in events, venues/)).toBeInTheDocument();
  });

  it('renders no collision warning when the proposal does not collide', async () => {
    serve([proposal()]);
    render(<SuggestionsTab />, { wrapper });

    await screen.findByTestId('tag-proposal-name');
    expect(screen.queryByTestId('tag-collision-warning')).toBeNull();
  });

  it('names the existing tag, its slug and its status on a name collision', async () => {
    serve([
      proposal({
        proposed_value: {
          name: 'Erotica',
          slug: 'erotica',
          collides_with: {
            kind: 'name',
            tag_slug: 'genre-erotica',
            tag_name: 'Erotica',
            tag_status: 'active',
          },
        },
      }),
    ]);
    render(<SuggestionsTab />, { wrapper });

    const warning = await screen.findByTestId('tag-collision-warning');
    expect(warning).toHaveTextContent('Name collision');
    expect(warning).toHaveTextContent('genre-erotica');
    expect(warning).toHaveTextContent('active');
    // The CI-gate consequence must be stated, not implied by a badge colour.
    expect(warning).toHaveTextContent(/duplicate_active_name/);
  });

  it('names the alias and flags a deprecated target as a revival', async () => {
    serve([
      proposal({
        proposed_value: {
          name: 'Silicone',
          slug: 'silicone',
          collides_with: {
            kind: 'alias',
            tag_slug: 'mat-silicone',
            tag_name: 'Silicone',
            tag_status: 'deprecated',
            via_alias: 'silicone',
            alias_review_status: 'approved',
          },
        },
      }),
    ]);
    render(<SuggestionsTab />, { wrapper });

    const warning = await screen.findByTestId('tag-collision-warning');
    expect(warning).toHaveTextContent('Alias collision');
    expect(warning).toHaveTextContent('mat-silicone');
    expect(warning).toHaveTextContent('deprecated');
    expect(warning).toHaveTextContent(/restore_deprecated_tag/);
  });

  it('approval mints the tag from its NAME and closes the proposal as applied', async () => {
    serve([proposal()]);
    createTag.mockResolvedValue({
      success: true,
      data: { id: 'tag-1', name: 'Bühne', slug: 'buhne' },
    });
    render(<SuggestionsTab />, { wrapper });

    await screen.findByTestId('tag-proposal-name');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /approve \+ create tag/i }));
    });

    await waitFor(() => expect(createTag).toHaveBeenCalledTimes(1));
    // The ONLY argument is the name — no slug (the DB derives it, and a
    // caller-supplied one beats the 20261128100000 seal) and no status (it
    // defaults to 'active'; writing it is how deprecated tags get resurrected).
    expect(createTag).toHaveBeenCalledWith('Bühne');
    expect(createTag.mock.calls[0]).toHaveLength(1);

    await waitFor(() =>
      expect(callSi).toHaveBeenCalledWith('suggestions/sug-1', {
        method: 'PATCH',
        body: { status: 'applied' },
      }),
    );
  });

  it('leaves the proposal untouched when the tag insert fails', async () => {
    serve([proposal()]);
    createTag.mockResolvedValue({ success: false, error: 'duplicate key value' });
    render(<SuggestionsTab />, { wrapper });

    await screen.findByTestId('tag-proposal-name');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /approve \+ create tag/i }));
    });

    await waitFor(() => expect(screen.getByText(/was NOT created/)).toBeInTheDocument());
    expect(callSi).not.toHaveBeenCalledWith(
      'suggestions/sug-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
