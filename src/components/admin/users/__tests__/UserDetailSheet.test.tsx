/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

const { rpc, usernameQuery } = vi.hoisted(() => ({ rpc: vi.fn(), usernameQuery: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: usernameQuery }) }) }),
  },
}));

vi.mock('@/hooks/usePageFetchers', () => ({ listFromWhere: vi.fn().mockResolvedValue([]) }));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => ({ isAdmin: true }) }));
vi.mock('@/hooks/useSecureRoleManagement', () => ({
  useSecureRoleManagement: () => ({ assignRole: vi.fn(), removeRole: vi.fn(), loading: false }),
}));

const { exportAdminUser } = vi.hoisted(() => ({ exportAdminUser: vi.fn() }));
vi.mock('@/lib/adminUsersExport', () => ({ exportAdminUser }));

import { UserDetailSheet } from '../UserDetailSheet';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

describe('UserDetailSheet', () => {
  it('renders closed when open=false', () => {
    const { container } = render(
      <UserDetailSheet user={null} open={false} onOpenChange={vi.fn()} onUserUpdated={vi.fn()} />,
      { wrapper },
    );
    expect(container).toBeTruthy();
  });
});

it('loads detail fields through the admin RPC and preserves the username confirmation handle', async () => {
  rpc.mockResolvedValue({
    data: [
      {
        bio: 'Example biography',
        gender_identity: 'Example identity',
        sexual_orientation: null,
        pronouns: null,
        location: null,
      },
    ],
    error: null,
  });
  usernameQuery.mockResolvedValue({ data: { username: 'example-user' }, error: null });
  render(
    <UserDetailSheet
      user={{
        id: 'p1',
        user_id: 'u1',
        display_name: 'Example User',
        first_name: null,
        last_name: null,
        avatar_url: null,
        location: null,
        user_mode: null,
        is_online: false,
        moderation_status: 'approved',
        profile_completion_percentage: 0,
        pronouns: null,
        created_at: '2026-10-01',
        last_seen_at: null,
        email: 'example@example.org',
      }}
      open
      onOpenChange={vi.fn()}
      onUserUpdated={vi.fn()}
    />,
    { wrapper },
  );
  await screen.findByText('Example biography');
  expect(rpc).toHaveBeenCalledWith('admin_user_detail', { p_user_id: 'u1' });
  expect(usernameQuery).toHaveBeenCalled();
});

it('exports the open user as one Excel or CSV record', async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  usernameQuery.mockResolvedValue({ data: { username: 'example-user' }, error: null });
  exportAdminUser.mockResolvedValue(undefined);
  const user = {
    id: 'p1',
    user_id: 'u1',
    display_name: 'Example User',
    first_name: null,
    last_name: null,
    avatar_url: null,
    location: 'Berlin',
    user_mode: 'traveler',
    is_online: false,
    moderation_status: 'approved',
    profile_completion_percentage: 40,
    pronouns: null,
    created_at: '2026-10-01',
    last_seen_at: null,
  };
  render(<UserDetailSheet user={user} open onOpenChange={vi.fn()} onUserUpdated={vi.fn()} />, {
    wrapper,
  });
  screen.getByRole('button', { name: /Export record \(Excel\)/ }).click();
  screen.getByRole('button', { name: /Export record \(CSV\)/ }).click();
  await vi.waitFor(() => expect(exportAdminUser).toHaveBeenCalledTimes(2));
  expect(exportAdminUser).toHaveBeenNthCalledWith(1, user, 'Excel');
  expect(exportAdminUser).toHaveBeenNthCalledWith(2, user, 'CSV');
});
