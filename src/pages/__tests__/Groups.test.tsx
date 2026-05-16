/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/groups/GroupCard', () => ({ GroupCard: () => null }));
vi.mock('@/components/groups/CreateGroupDialog', () => ({ CreateGroupDialog: () => null }));
vi.mock('@/components/groups/GroupFilters', () => ({ GroupFilters: () => null }));
vi.mock('@/hooks/useGroups', () => ({
  useGroups: () => ({
    groups: [], userGroups: [], isLoading: false,
    createGroup: vi.fn(), isCreating: false,
    joinGroup: vi.fn(), isJoining: false,
    requestJoin: vi.fn(), isRequesting: false,
    leaveGroup: vi.fn(), isLeaving: false,
  }),
}));
vi.mock('@/components/layout/AuthGate', () => ({ AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import Groups from '../Groups';

describe('Groups', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><Groups /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
