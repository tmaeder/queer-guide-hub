/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The gate's job: public visitors must never load the CMS behind the control.
// Count how often the implementation module is requested.
const { implLoaded, useAuthMock, useAdminRolesMock, usePageEntityMock } = vi.hoisted(() => ({
  implLoaded: vi.fn(),
  useAuthMock: vi.fn(),
  useAdminRolesMock: vi.fn(),
  usePageEntityMock: vi.fn(),
}));

vi.mock('../AdminEditButton.impl', () => {
  implLoaded();
  return { default: () => <button type="button">real admin control</button> };
});
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: useAdminRolesMock }));
vi.mock('@/contexts/PageEntityContext', () => ({ usePageEntity: usePageEntityMock }));

const roles = (staff: boolean, loading = false) =>
  useAdminRolesMock.mockReturnValue({ canManageContent: () => staff, loading });

beforeEach(() => {
  implLoaded.mockClear();
  useAuthMock.mockReset();
  useAdminRolesMock.mockReset();
  usePageEntityMock.mockReset();
  useAuthMock.mockReturnValue({ user: null });
});

afterEach(() => {
  vi.resetModules();
});

describe('AdminEditButton gate', () => {
  it('renders nothing and loads nothing for a signed-out visitor', async () => {
    roles(false);
    const { AdminEditButton } = await import('../AdminEditButton');
    const { container } = render(<AdminEditButton contentType="venues" contentId="v1" />);
    expect(container.firstChild).toBeNull();
    expect(implLoaded).not.toHaveBeenCalled();
  });

  it('loads nothing while roles are still loading', async () => {
    roles(false, true);
    const { AdminEditButton } = await import('../AdminEditButton');
    render(<AdminEditButton contentType="venues" contentId="v1" />);
    expect(implLoaded).not.toHaveBeenCalled();
  });

  it('still publishes the page entity for every visitor', async () => {
    roles(false);
    const { AdminEditButton } = await import('../AdminEditButton');
    render(<AdminEditButton contentType="venues" contentId="v1" contentName="Le Mistral" />);
    expect(usePageEntityMock).toHaveBeenCalledWith({
      contentType: 'venues',
      contentId: 'v1',
      contentName: 'Le Mistral',
    });
  });

  it('loads and renders the real control for staff', async () => {
    roles(true);
    const { AdminEditButton } = await import('../AdminEditButton');
    render(<AdminEditButton contentType="venues" contentId="v1" />);
    expect(await screen.findByRole('button', { name: 'real admin control' })).toBeTruthy();
    expect(implLoaded).toHaveBeenCalledTimes(1);
  });

  it('loads the real control for the content owner without a staff role', async () => {
    roles(false);
    useAuthMock.mockReturnValue({ user: { id: 'owner-1' } });
    const { AdminEditButton } = await import('../AdminEditButton');
    render(<AdminEditButton contentType="groups" contentId="g1" ownerUserId="owner-1" />);
    expect(await screen.findByRole('button', { name: 'real admin control' })).toBeTruthy();
  });
});
