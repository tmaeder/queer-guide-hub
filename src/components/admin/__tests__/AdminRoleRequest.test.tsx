/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useAuthMock, useAdminRolesMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useAdminRolesMock: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: useAdminRolesMock }));

import { AdminRoleRequest } from '../AdminRoleRequest';

beforeEach(() => {
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
  useAdminRolesMock.mockReset();
});

describe('AdminRoleRequest', () => {
  it('shows checking message while loading', () => {
    useAdminRolesMock.mockReturnValue({ isAdmin: false, loading: true });
    render(<AdminRoleRequest />);
    expect(screen.getByText(/Checking your permissions/i)).toBeInTheDocument();
  });

  it('renders nothing when user is admin', () => {
    useAdminRolesMock.mockReturnValue({ isAdmin: true, loading: false });
    const { container } = render(<AdminRoleRequest />);
    expect(container.firstChild).toBeNull();
  });

  it('shows access required card for non-admins', () => {
    useAdminRolesMock.mockReturnValue({ isAdmin: false, loading: false });
    render(<AdminRoleRequest />);
    expect(screen.getByText(/Admin Access Required/i)).toBeInTheDocument();
    expect(screen.getByText(/contact an existing administrator/i)).toBeInTheDocument();
  });
});
