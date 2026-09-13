/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

const { useAuthMock, useAdminRolesMock, sheetSpy, historySpy, setPinnedMock, editModeMock } =
  vi.hoisted(() => ({
    useAuthMock: vi.fn(),
    useAdminRolesMock: vi.fn(),
    sheetSpy: vi.fn(),
    historySpy: vi.fn(),
    setPinnedMock: vi.fn(),
    editModeMock: vi.fn(),
  }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: useAdminRolesMock }));
vi.mock('@/hooks/useAdminEditMode', () => ({ useAdminEditMode: editModeMock }));
vi.mock('../inline/AdminFullEditSheet', () => ({
  AdminFullEditSheet: (props: { open: boolean; contentType: string }) => {
    sheetSpy(props);
    return props.open ? <div data-testid="sheet">{props.contentType}</div> : null;
  },
}));
vi.mock('../RevisionHistorySheet', () => ({
  RevisionHistorySheet: (props: { open: boolean; contentId: string }) => {
    historySpy(props);
    return props.open ? <div data-testid="history">{props.contentId}</div> : null;
  },
}));

import { AdminEditButton } from '../AdminEditButton';

const renderIn = (ui: React.ReactElement, initial = '/venues/some-bar') =>
  render(<MemoryRouter initialEntries={[initial]}>{ui}</MemoryRouter>);

/**
 * Radix opens a dropdown on `pointerdown`, which `fireEvent.click` does not
 * emit — a plain click leaves the menu shut and every assertion below it
 * vacuous.
 */
const openMenu = async () => {
  await userEvent.click(screen.getByRole('button', { name: /More admin actions/i }));
};

beforeEach(() => {
  useAuthMock.mockReset();
  useAdminRolesMock.mockReset();
  sheetSpy.mockReset();
  historySpy.mockReset();
  setPinnedMock.mockReset();
  editModeMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
  editModeMock.mockReturnValue({
    isAdmin: true,
    altHeld: false,
    pinned: false,
    editMode: false,
    setPinned: setPinnedMock,
  });
});

describe('AdminEditButton', () => {
  it('returns null while role loading', () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => false, loading: true });
    const { container } = renderIn(<AdminEditButton contentType="venues" contentId="v1" />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when user lacks permission and not owner', () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => false, loading: false });
    const { container } = renderIn(<AdminEditButton contentType="venues" contentId="v1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders button when canManageContent', () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
    renderIn(<AdminEditButton contentType="venues" contentId="v1" />);
    expect(screen.getByRole('button', { name: /Edit all fields/i })).toBeInTheDocument();
  });

  it('renders button for owner even without admin role', () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => false, loading: false });
    renderIn(<AdminEditButton contentType="venues" contentId="v1" ownerUserId="u1" />);
    expect(screen.getByRole('button', { name: /Edit all fields/i })).toBeInTheDocument();
  });

  it('opens side sheet on click', () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
    renderIn(<AdminEditButton contentType="venues" contentId="v1" />);
    fireEvent.click(screen.getByRole('button', { name: /Edit all fields/i }));
    expect(screen.getByTestId('sheet')).toHaveTextContent('venues');
  });

  // ── the switcher ────────────────────────────────────────────────────

  it('offers Open in CMS to staff', async () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
    renderIn(<AdminEditButton contentType="venues" contentId="v1" />);
    await openMenu();
    expect(await screen.findByText('Open in CMS')).toBeInTheDocument();
  });

  it('does NOT offer the CMS, history or edit mode to a mere owner', () => {
    // The owner of a record may edit their own row. The CMS, revision history
    // and the site-wide inline edit mode are staff tools.
    useAdminRolesMock.mockReturnValue({ canManageContent: () => false, loading: false });
    renderIn(<AdminEditButton contentType="venues" contentId="v1" ownerUserId="u1" />);
    expect(screen.queryByRole('button', { name: /More admin actions/i })).toBeNull();
    expect(historySpy).not.toHaveBeenCalled();
  });

  it('omits Open in CMS for a content type that is not in the registry', async () => {
    // A stale singular type string would otherwise link at /admin/content/venue,
    // which silently renders the All-content list instead of 404ing.
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
    renderIn(<AdminEditButton contentType="venue" contentId="v1" />);
    await openMenu();
    expect(await screen.findByText('Revision history')).toBeInTheDocument();
    expect(screen.queryByText('Open in CMS')).toBeNull();
  });

  it('opens revision history', async () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
    renderIn(<AdminEditButton contentType="venues" contentId="v1" />);
    await openMenu();
    fireEvent.click(await screen.findByText('Revision history'));
    await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('v1'));
  });

  it('toggles the inline edit pin', async () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
    renderIn(<AdminEditButton contentType="venues" contentId="v1" />);
    await openMenu();
    fireEvent.click(await screen.findByText('Inline edit mode'));
    await waitFor(() => expect(setPinnedMock).toHaveBeenCalledWith(true));
  });
});
