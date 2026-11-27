import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import { MeetMembersNotice } from '../MeetMembersNotice';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/untyped', () => ({ untypedRpc: rpc }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useStatus', () => ({ useStatus: () => ({ status: null }) }));
beforeEach(() => rpc.mockReset());

describe('member availability notice', () => {
  it('does not claim an empty community when counts fail', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('offline') });
    renderWithProviders(<MeetMembersNotice />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('No members are listed here yet')).not.toBeInTheDocument();
  });

  it('waits for counts before presenting an empty community', async () => {
    let finish!: (value: unknown) => void;
    rpc.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderWithProviders(<MeetMembersNotice />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('No members are listed here yet')).not.toBeInTheDocument();
    finish({ data: { here: 0, total: 0 }, error: null });
    expect(await screen.findByText('No members are listed here yet')).toBeInTheDocument();
  });
});
