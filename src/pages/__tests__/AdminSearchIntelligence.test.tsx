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
    expect(screen.getByRole('tab', { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Synonyms/i })).toBeInTheDocument();
  });
});
