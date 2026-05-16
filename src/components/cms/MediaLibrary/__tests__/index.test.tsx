/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => ({ isAdmin: true, canManageContent: () => true }) }));
vi.mock('@/hooks/useUnifiedMedia', () => ({
  useUnifiedMedia: () => ({ items: [], totalCount: 0, loading: false, error: null, refresh: vi.fn() }),
  PAGE_SIZE: 50,
}));
vi.mock('@/hooks/useMediaMutations', () => ({
  useMediaMutations: () => ({ bulkDelete: vi.fn(), bulkOptimize: vi.fn(), isPending: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../MediaToolbar', () => ({ MediaToolbar: () => null }));
vi.mock('../MediaGrid', () => ({ MediaGrid: () => null }));
vi.mock('../StorageBreakdown', () => ({ StorageBreakdown: () => null }));
vi.mock('../DuplicateFinderPanel', () => ({ DuplicateFinderPanel: () => null }));
vi.mock('../MediaUploadZone', () => ({ MediaUploadZone: () => null }));

import { MediaLibrary } from '../index';

describe('MediaLibrary', () => {
  it('renders', () => {
    const { container } = render(<MediaLibrary />);
    expect(container).toBeTruthy();
  });
});
