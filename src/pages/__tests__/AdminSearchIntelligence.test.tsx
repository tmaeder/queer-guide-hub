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
  it('renders tabs', () => {
    renderWithProviders(<AdminSearchIntelligence />);
    expect(screen.getByRole('tab', { name: /setup/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /synonyms/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /audit/i })).toBeInTheDocument();
  });
});
