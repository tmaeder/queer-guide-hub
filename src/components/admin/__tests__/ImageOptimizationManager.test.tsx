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
  listFrom: vi.fn().mockResolvedValue([]),
  listFromWhere: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, session: null, signIn: vi.fn(), signOut: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { ImageOptimizationManager } from '../ImageOptimizationManager';

describe('ImageOptimizationManager', () => {
  it('renders without crashing', () => {
    const { container } = render(<ImageOptimizationManager />);
    expect(container).toBeTruthy();
  });
});
