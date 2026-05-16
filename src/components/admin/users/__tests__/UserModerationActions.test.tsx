/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ error: null }) },
}));
vi.mock('@/hooks/usePageFetchers', () => ({
  updateRowsBy: vi.fn().mockResolvedValue({ error: null }),
}));

import { UserModerationActions } from '../UserModerationActions';

describe('UserModerationActions', () => {
  it('renders current Approved status', () => {
    render(<UserModerationActions userId="u1" currentStatus="approved" displayName="Alice" onStatusChanged={vi.fn()} />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('hides Reinstate for approved user', () => {
    render(<UserModerationActions userId="u1" currentStatus="approved" displayName="Alice" onStatusChanged={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Reinstate/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Suspend/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ban/ })).toBeInTheDocument();
  });

  it('shows Reinstate when banned', () => {
    render(<UserModerationActions userId="u1" currentStatus="banned" displayName="Alice" onStatusChanged={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Reinstate/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ban$/ })).toBeNull();
  });

  it('clicking Suspend opens confirm dialog', () => {
    render(<UserModerationActions userId="u1" currentStatus="approved" displayName="Alice" onStatusChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Suspend/ }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/Suspend User/i)).toBeInTheDocument();
  });
});
