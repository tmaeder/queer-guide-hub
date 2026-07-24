import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import AdminSearchIntelligence from '../AdminSearchIntelligence';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async () => ({ data: { success: true, data: [] }, error: null })),
    },
  },
}));

describe('AdminSearchIntelligence', () => {
  it('renders the tab surface', () => {
    renderWithProviders(<AdminSearchIntelligence />);
    expect(screen.getByText(/Search Intelligence/i)).toBeInTheDocument();
    // Surviving (non-Meili) tabs after the Meili decommission.
    expect(screen.getByRole('tab', { name: /Setup/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Audit/i })).toBeInTheDocument();
    // Postgres-era tabs.
    expect(screen.getByRole('tab', { name: /Analytics/i })).toBeInTheDocument();
    // Synonyms returns as a Postgres-backed editor (not the old Meili tab).
    expect(screen.getByRole('tab', { name: /Synonyms/i })).toBeInTheDocument();
    // The Meili index-management tabs are gone.
    expect(screen.queryByRole('tab', { name: /Reindex/i })).toBeNull();
    // Topics was retired in P3 (manual cluster editor, 0 rows).
    expect(screen.queryByRole('tab', { name: /Topics/i })).toBeNull();
  });
});
