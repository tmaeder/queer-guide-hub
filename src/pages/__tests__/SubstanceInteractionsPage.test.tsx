import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

/**
 * Attribution on /tags/interactions.
 *
 * WHY THIS IS A UNIT TEST AND NOT AN E2E. The e2e for this page runs against
 * PRODUCTION, so it can only ever assert what prod currently serves. The most
 * important case here is the one prod must never be in — an RPC response with
 * no `sources` — and the only way to exercise that deliberately is to hand the
 * component the payload directly.
 *
 * THE REGRESSION BEING GUARDED. `substance_interaction_matrix()` used to return
 * `source: 'tripsit'` as a literal over a grid where 55 of 476 rows are
 * eve&rave Substanzhandbuch or FDA labels. The page fell back to that scalar
 * when `sources` was absent. `20261207100000` deleted the scalar and this file
 * pins the consequence: absence must render SILENCE, never a guessed name.
 */

const mockMatrix = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(async () => ({ data: mockMatrix(), error: null })) },
}));

const { default: SubstanceInteractionsPage } = await import('../SubstanceInteractionsPage');

const MDMA = '11111111-1111-1111-1111-111111111111';
const MAOIS = '22222222-2222-2222-2222-222222222222';

const matrix = (over: Record<string, unknown> = {}) => ({
  axis: [
    { id: MDMA, slug: 'mdma', name: 'MDMA' },
    { id: MAOIS, slug: 'maois', name: 'MAOIs' },
  ],
  cells: [
    {
      a: MDMA < MAOIS ? MDMA : MAOIS,
      b: MDMA < MAOIS ? MAOIS : MDMA,
      status: 'dangerous',
      severity: 1,
      note: 'Serotonin syndrome risk.',
      source: 'eve&rave Substanzhandbuch',
      source_url: 'https://www.eve-rave.ch/das-substanzhandbuch/',
    },
  ],
  sources: [
    { source: 'tripsit', source_url: 'https://combo.tripsit.me/', cells: 421 },
    {
      source: 'eve&rave Substanzhandbuch',
      source_url: 'https://www.eve-rave.ch/das-substanzhandbuch/',
      cells: 48,
    },
    { source: 'FDA label', source_url: 'https://dailymed.nlm.nih.gov/x', cells: 7 },
  ],
  ...over,
});

describe('/tags/interactions attribution', () => {
  beforeEach(() => mockMatrix.mockReset());

  it('credits every source in the grid, not just the largest', async () => {
    mockMatrix.mockReturnValue(matrix());
    renderWithProviders(<SubstanceInteractionsPage />);

    const credit = await screen.findByTestId('interaction-credit');
    // The property, not a fixed string: every source the payload declares is
    // named. Asserting only "TripSit" would have passed against the bug.
    for (const name of ['TripSit', 'eve&rave Substanzhandbuch', 'FDA label']) {
      expect(credit).toHaveTextContent(name);
    }
  });

  it('renders NO credit when the response declares no sources', async () => {
    // The pre-migration RPC shape. The page used to fall back to a top-level
    // `source` scalar here, which always said 'tripsit' — reinstating the exact
    // misattribution. Silence is the correct answer; a wrong name is not.
    mockMatrix.mockReturnValue({ ...matrix(), sources: undefined });
    renderWithProviders(<SubstanceInteractionsPage />);

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('interaction-credit')).not.toBeInTheDocument();
    expect(screen.queryByText(/TripSit/)).not.toBeInTheDocument();
  });

  it('names the source of the specific pair the checker answers', async () => {
    // The footer says which bodies contributed somewhere. This box gives ONE
    // verdict, and the reader acting on it is entitled to know whose it is —
    // here a pair that is NOT TripSit's, so a page-level assumption would show
    // the wrong attributor.
    mockMatrix.mockReturnValue(matrix());
    renderWithProviders(<SubstanceInteractionsPage />);

    await screen.findByTestId('interaction-credit');
    const [first, second] = screen.getAllByRole('combobox');
    fireEvent.change(first, { target: { value: MDMA } });
    fireEvent.change(second, { target: { value: MAOIS } });

    const box = await screen.findByTestId('pair-verdict');
    expect(box).toHaveTextContent(/MDMA \+ MAOIs|MAOIs \+ MDMA/);
    // Scoped to the verdict box on purpose: the footer credit names all three
    // sources, so an unscoped query would pass even if this box said nothing.
    expect(box).toHaveTextContent('eve&rave Substanzhandbuch');
    expect(box).not.toHaveTextContent('TripSit');
  });
});
