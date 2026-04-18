import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const mockNavigate = vi.fn();
const mockToast = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

let mockUser: { id: string } | null = { id: 'u-1' };
let mockAuthLoading = false;
let mockIsAdmin = true;
let mockIsModerator = false;
let mockRolesLoading = false;

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: mockAuthLoading }),
}));

vi.mock('@/hooks/useAdminRoles', () => ({
  useAdminRoles: () => ({
    isAdmin: mockIsAdmin,
    isModerator: mockIsModerator,
    loading: mockRolesLoading,
  }),
}));

import { AdminRouteGuard } from '../AdminRouteGuard';

describe('AdminRouteGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'u-1' };
    mockAuthLoading = false;
    mockIsAdmin = true;
    mockIsModerator = false;
    mockRolesLoading = false;
  });

  it('should render children when user is admin', () => {
    render(
      <MemoryRouter>
        <AdminRouteGuard>
          <div>Admin Content</div>
        </AdminRouteGuard>
      </MemoryRouter>,
    );
    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('should redirect unauthenticated users', async () => {
    mockUser = null;
    render(
      <MemoryRouter>
        <AdminRouteGuard>
          <div>Secret</div>
        </AdminRouteGuard>
      </MemoryRouter>,
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/auth'));
  });

  it('should redirect users without admin role', async () => {
    mockIsAdmin = false;
    mockIsModerator = false;
    render(
      <MemoryRouter>
        <AdminRouteGuard requiredRole="admin">
          <div>Secret</div>
        </AdminRouteGuard>
      </MemoryRouter>,
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  it('should allow moderator for moderator-required routes', () => {
    mockIsAdmin = false;
    mockIsModerator = true;
    render(
      <MemoryRouter>
        <AdminRouteGuard requiredRole="moderator">
          <div>Mod Content</div>
        </AdminRouteGuard>
      </MemoryRouter>,
    );
    expect(screen.getByText('Mod Content')).toBeInTheDocument();
  });

  it('should show loading state while checking permissions', () => {
    mockRolesLoading = true;
    render(
      <MemoryRouter>
        <AdminRouteGuard>
          <div>Content</div>
        </AdminRouteGuard>
      </MemoryRouter>,
    );
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });
});
