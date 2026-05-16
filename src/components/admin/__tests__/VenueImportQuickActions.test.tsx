/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } },
}));
vi.mock('@/hooks/usePageFetchers', () => ({
  listFromWhere: vi.fn().mockResolvedValue([]),
  listFrom: vi.fn().mockResolvedValue([]),
}));

import { VenueImportQuickActions } from '../VenueImportQuickActions';

describe('VenueImportQuickActions', () => {
  it('renders without crashing', () => {
    const { container } = render(<VenueImportQuickActions />);
    expect(container).toBeTruthy();
  });
});
