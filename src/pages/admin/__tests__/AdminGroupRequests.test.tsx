import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import AdminGroupRequests from '../AdminGroupRequests';

vi.mock('@/components/admin/groups/PendingJoinRequestsPanel', () => ({
  PendingJoinRequestsPanel: () => <p>Pending membership decisions</p>,
}));

describe('Groups join requests workspace', () => {
  it('keeps membership decisions beside the group list with the correct active tab', () => {
    render(
      <MemoryRouter initialEntries={['/admin/content/community_groups/requests']}>
        <AdminGroupRequests />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Groups' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Join requests' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'List' })).toHaveAttribute('href', '/admin/content/community_groups');
    expect(screen.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('Pending membership decisions')).toBeInTheDocument();
  });
});
