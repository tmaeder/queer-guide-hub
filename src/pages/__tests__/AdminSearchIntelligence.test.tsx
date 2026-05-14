import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the feature-flag placeholder when flag is unset', () => {
    vi.stubEnv('VITE_FEATURE_SEARCH_INTELLIGENCE', '');
    renderWithProviders(<AdminSearchIntelligence />);
    expect(screen.getByText(/Search Intelligence/i)).toBeInTheDocument();
    expect(
      screen.getByText(/feature flag/i, { selector: 'p, span, div, code, em' }),
    ).toBeInTheDocument();
  });
});
