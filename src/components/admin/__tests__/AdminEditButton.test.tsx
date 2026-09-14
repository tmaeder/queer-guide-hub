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

  // ── the polish pass ─────────────────────────────────────────────────

  it('keeps the menu trigger wiring intact under the tooltip wrapper', async () => {
    // The chevron is a DropdownMenuTrigger `asChild` INSIDE a TooltipTrigger
    // `asChild` — two nested Radix Slots onto one Button, and a composition
    // with no other instance in this repo. If the outer Slot swallowed the
    // menu's props the button would still render and still be clickable, and
    // every assertion about the menu below would fail for a reason that looks
    // like a menu bug. Assert the trigger contract directly.
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
    renderIn(<AdminEditButton contentType="venues" contentId="v1" />);
    const trigger = screen.getByRole('button', { name: 'More admin actions' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await openMenu();
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
  });

  it('groups record actions apart from the page-wide mode', async () => {
    // The pin is site-wide and session-scoped while the two items above it act
    // on one record. A flat list is how someone turns on a global mode
    // believing it applies only to the page in front of them.
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
    renderIn(<AdminEditButton contentType="venues" contentId="v1" />);
    await openMenu();
    expect(await screen.findByText('This record')).toBeInTheDocument();
    expect(screen.getByText('This page')).toBeInTheDocument();

    // Order, not just presence: the CMS link must sit under "This record".
    const labels = screen.getAllByText(/^This (record|page)$/).map((n) => n.textContent);
    expect(labels).toEqual(['This record', 'This page']);
    const record = screen.getByText('This record');
    const page = screen.getByText('This page');
    const cms = screen.getByText('Open in CMS');
    expect(record.compareDocumentPosition(cms) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(page.compareDocumentPosition(cms) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('names the Alt fast path on the inline edit item only', async () => {
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
    renderIn(<AdminEditButton contentType="venues" contentId="v1" />);
    await openMenu();
    const item = (await screen.findByText('Inline edit mode')).closest('[role="menuitemcheckbox"]');
    expect(item).not.toBeNull();
    expect(item).toHaveTextContent('Alt');
    // Nowhere else — a shortcut hint on an item that has no shortcut is a lie.
    expect(screen.getByText('Open in CMS').closest('[role="menuitem"]')).not.toHaveTextContent(
      'Alt',
    );
  });

  it('gives the checkbox item no icon of its own', async () => {
    // A checkbox item reserves its left gutter for the check indicator, so an
    // icon inside one renders as a second glyph competing with the mark that
    // actually carries the state. The check IS the icon.
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
    renderIn(<AdminEditButton contentType="venues" contentId="v1" />);
    await openMenu();
    const item = (await screen.findByText('Inline edit mode')).closest('[role="menuitemcheckbox"]');
    expect(item!.querySelectorAll('svg')).toHaveLength(0);
  });

  it('spaces the icon away from the label on every plain menu item', async () => {
    // DropdownMenuItem has no `gap` of its own — unlike Button, whose base
    // style carries `gap-2` — so an unspaced icon sits flush against the text.
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
    renderIn(<AdminEditButton contentType="venues" contentId="v1" />);
    await openMenu();
    for (const label of ['Open in CMS', 'Revision history']) {
      const svg = screen.getByText(label).closest('[role="menuitem"]')!.querySelector('svg');
      expect(svg, `${label} has no icon`).not.toBeNull();
      expect(svg!.getAttribute('class') ?? '', `${label} icon is not spaced`).toMatch(/\bmr-2\b/);
    }
  });

  it('keeps the split control seamed rather than fusing the two halves', async () => {
    // The first cut deleted the pencil's right border so the halves would not
    // show a double line, which removed the only thing saying it is two
    // controls. Both borders stay; the chevron is pulled a pixel left so they
    // collapse into one shared seam.
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
    renderIn(<AdminEditButton contentType="venues" contentId="v1" />);
    const pencil = screen.getByRole('button', { name: /Edit all fields/i });
    const chevron = screen.getByRole('button', { name: 'More admin actions' });
    expect(pencil.className).not.toMatch(/\bborder-r-0\b/);
    expect(chevron.className).toMatch(/-ml-px/);
    // The focus ring is `ring-2 ring-offset-2`; on adjoined controls it is
    // drawn under the neighbour unless the focused half is lifted.
    expect(pencil.className).toMatch(/focus-visible:z-10/);
    expect(chevron.className).toMatch(/focus-visible:z-10/);
  });

  it('says why the control exists in the accessible name, not only the tooltip', () => {
    // The name used to be "Edit all fields" while the tooltip read
    // "Edit all fields (Admin)" — so the one piece of explanation was the one
    // piece a screen reader never got.
    useAdminRolesMock.mockReturnValue({ canManageContent: () => true, loading: false });
    renderIn(<AdminEditButton contentType="venues" contentId="v1" />);
    expect(screen.getByRole('button', { name: 'Edit all fields (Admin)' })).toBeInTheDocument();
  });
});
