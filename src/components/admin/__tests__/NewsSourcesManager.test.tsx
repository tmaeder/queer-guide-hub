/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
  },
}));
vi.mock('@/hooks/usePageFetchers', () => ({
  insertInto: vi.fn().mockResolvedValue({ id: '1' }),
  updateRow: vi.fn().mockResolvedValue({}),
  deleteRow: vi.fn().mockResolvedValue({}),
  useNewsSources: vi.fn().mockReturnValue({ data: [], isLoading: false, refetch: vi.fn() }),
}));

import { NewsSourcesManager } from '../NewsSourcesManager';

describe('NewsSourcesManager', () => {
  it('renders without crashing', () => {
    const { container } = render(<NewsSourcesManager />);
    expect(container).toBeTruthy();
  });
});
