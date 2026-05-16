/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/groups/GroupCard', () => ({ GroupCard: () => null }));
vi.mock('@/components/groups/CreateGroupDialog', () => ({ CreateGroupDialog: () => null }));
vi.mock('@/hooks/useGroups', () => ({
  useGroups: () => ({
    userGroups: [], isLoading: false, createGroup: vi.fn(), isCreating: false,
    leaveGroup: vi.fn(), isLeaving: false,
  }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import MyGroups from '../MyGroups';

describe('MyGroups', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><MyGroups /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
