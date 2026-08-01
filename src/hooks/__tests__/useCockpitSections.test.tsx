/**
 * @vitest-environment jsdom
 *
 * The migration case is the one that matters: profiles.preferences.cockpit still
 * holds v1 layout blobs in production, whose `hidden` array lists WIDGET ids.
 * Those must resolve to "everything visible", not silently hide a section whose
 * id happens to collide.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const updateSpy = vi.fn();
let profileValue: { preferences: Record<string, unknown> } | null = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ update: (v: unknown) => ({ eq: () => updateSpy(v) }) }),
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: profileValue }),
  profileQueryKey: (id: string) => ['profile', id],
}));
vi.mock('@/hooks/useGranularRoles', () => ({
  useGranularRoles: () => ({ effectiveRole: 'admin', loading: false }),
}));

import { useCockpitSections } from '@/hooks/useCockpitSections';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Seed the profile cache so the optimistic patch path has something to read.
  qc.setQueryData(['profile', 'u-1'], profileValue);
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  updateSpy.mockClear();
  profileValue = null;
});

describe('useCockpitSections', () => {
  it('shows every section when no preference is stored', () => {
    const { result } = renderHook(() => useCockpitSections(), { wrapper });
    expect(result.current.isVisible('needs-you')).toBe(true);
    expect(result.current.isVisible('broken')).toBe(true);
    expect(result.current.isVisible('jump-to')).toBe(true);
    expect(result.current.isVisible('footprint')).toBe(true);
  });

  it('treats a stale v1 widget-layout blob as "nothing hidden"', () => {
    profileValue = {
      preferences: {
        cockpit: {
          version: 1,
          byRole: {
            admin: {
              order: ['triageInbox', 'systemHealth'],
              hidden: ['systemHealth', 'duplicates'],
              pinned: ['triageInbox'],
            },
          },
        },
      },
    };
    const { result } = renderHook(() => useCockpitSections(), { wrapper });
    expect(result.current.hidden.size).toBe(0);
    expect(result.current.isVisible('broken')).toBe(true);
  });

  it('honours a stored v2 hidden list', () => {
    profileValue = {
      preferences: { cockpit: { version: 2, byRole: { admin: { hidden: ['footprint'] } } } },
    };
    const { result } = renderHook(() => useCockpitSections(), { wrapper });
    expect(result.current.isVisible('footprint')).toBe(false);
    expect(result.current.isVisible('jump-to')).toBe(true);
  });

  it('persists version 2 when toggling', () => {
    const { result } = renderHook(() => useCockpitSections(), { wrapper });
    act(() => result.current.toggle('footprint'));
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const written = updateSpy.mock.calls[0][0] as {
      preferences: { cockpit: { version: number; byRole: Record<string, { hidden: string[] }> } };
    };
    expect(written.preferences.cockpit.version).toBe(2);
    expect(written.preferences.cockpit.byRole.admin.hidden).toEqual(['footprint']);
  });

  it('persists an empty hidden list on reset', () => {
    profileValue = {
      preferences: { cockpit: { version: 2, byRole: { admin: { hidden: ['broken'] } } } },
    };
    const { result } = renderHook(() => useCockpitSections(), { wrapper });
    act(() => result.current.reset());
    const written = updateSpy.mock.calls[0][0] as {
      preferences: { cockpit: { byRole: Record<string, { hidden: string[] }> } };
    };
    expect(written.preferences.cockpit.byRole.admin.hidden).toEqual([]);
  });
});
