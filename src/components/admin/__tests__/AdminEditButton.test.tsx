/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useAuthMock, useAdminRolesMock, dialogSpy } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useAdminRolesMock: vi.fn(),
  dialogSpy: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: useAdminRolesMock }));
vi.mock('../AdminEditDialog', () => ({
  AdminEditDialog: (props: { open: boolean; contentType: string }) => {
    dialogSpy(props);
    return props.open ? <div data-testid="dialog">{props.contentType}</div> : null;
  },
}));

import { AdminEditButton } from '../AdminEditButton';

beforeEach(() => {
  useAuthMock.mockReset();
  useAdminRolesMock.mockReset();
  dialogSpy.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
});

describe('AdminEditButton', () => {
  it('returns null while role loading', () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => false, loading: true });
    const { container } = render(<AdminEditButton contentType="venue" contentId="v1" />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when user lacks permission and not owner', () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => false, loading: false });
    const { container } = render(<AdminEditButton contentType="venue" contentId="v1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders button when canManageContent', () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
    render(<AdminEditButton contentType="venue" contentId="v1" />);
    expect(screen.getByRole('button', { name: /Edit content/i })).toBeInTheDocument();
  });

  it('renders button for owner even without admin role', () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => false, loading: false });
    render(<AdminEditButton contentType="venue" contentId="v1" ownerUserId="u1" />);
    expect(screen.getByRole('button', { name: /Edit content/i })).toBeInTheDocument();
  });

  it('opens dialog on click', () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
    render(<AdminEditButton contentType="venue" contentId="v1" />);
    fireEvent.click(screen.getByRole('button', { name: /Edit content/i }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('venue');
  });
});
