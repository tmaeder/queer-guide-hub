import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { PeopleModeView } from '@/pages/people/PeopleModeView';

const { rpc, profiles, auth } = vi.hoisted(() => ({
  rpc: vi.fn(),
  profiles: vi.fn(),
  auth: { user: { id: 'viewer' } as { id: string } | null },
}));
vi.mock('@/hooks/useIntimateProfile', () => ({ useDatingMarks: () => ({ data: new Set() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc, from: () => ({ select: () => ({ in: profiles }) }) },
}));

function mount() {
  return renderWithProviders(
    <PeopleModeView mode="friends" emptyState={<p>No matching people</p>} />,
  );
}

beforeEach(() => {
  auth.user = { id: 'viewer' };
  rpc
    .mockReset()
    .mockResolvedValue({ data: [{ user_id: 'alex', score: 90, shared: {} }], error: null });
  profiles.mockReset().mockResolvedValue({
    data: [{ user_id: 'alex', display_name: 'Alex', avatar_url: null }],
    error: null,
  });
});

describe('shared discovery lifecycle', () => {
  it('retries a discovery failure without claiming the community is empty', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('People could not be loaded');
    expect(screen.queryByText('No matching people')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Alex')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('waits for profile hydration instead of displaying nameless cards', async () => {
    let finish!: (value: unknown) => void;
    profiles.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    mount();
    await waitFor(() => expect(profiles).toHaveBeenCalled());
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Member')).not.toBeInTheDocument();
    finish({ data: [{ user_id: 'alex', display_name: 'Alex', avatar_url: null }], error: null });
    expect(await screen.findByText('Alex')).toBeInTheDocument();
  });

  it('retries profile failure independently of the ranking request', async () => {
    profiles.mockResolvedValueOnce({ data: null, error: new Error('profile fetch failed') });
    mount();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Alex')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(profiles).toHaveBeenCalledTimes(2);
  });

  it('omits profiles that are no longer readable', async () => {
    profiles.mockResolvedValue({ data: [], error: null });
    mount();
    expect(await screen.findByText('No matching people')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('does not query or show empty-result copy when signed out', () => {
    auth.user = null;
    mount();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
    expect(profiles).not.toHaveBeenCalled();
  });
});
