import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));

vi.mock('@/components/profile/SocialLinksDisplay', () => ({
  SocialLinksDisplay: () => <div data-testid="social-links" />,
}));

import { GroupMembersList } from '../GroupMembersList';

const mockMembers = [
  {
    user_id: 'u-1',
    role: 'admin',
    joined_at: '2024-01-01T00:00:00Z',
    profiles: { display_name: 'Alice', avatar_url: 'https://img.test/a.jpg' },
  },
  {
    user_id: 'u-2',
    role: 'member',
    joined_at: '2024-06-01T00:00:00Z',
    profiles: { display_name: 'Bob', avatar_url: '' },
  },
];

describe('GroupMembersList', () => {
  it('should render member names', () => {
    render(<GroupMembersList members={mockMembers as unknown as React.ComponentProps<typeof GroupMembersList>['members']} canManage={false} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('should show role badges', () => {
    render(<GroupMembersList members={mockMembers as unknown as React.ComponentProps<typeof GroupMembersList>['members']} canManage={false} />);
    expect(screen.getByText(/admin/i)).toBeInTheDocument();
  });

  it('should render without crashing with empty members', () => {
    const { container } = render(<GroupMembersList members={[]} canManage={false} />);
    expect(container).toBeTruthy();
  });
});
