/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Box, Layers } from '@/components/icons';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { email: 'a@b' } }) }));
vi.mock('@/hooks/useGranularRoles', () => ({
  useGranularRoles: () => ({ effectiveRole: 'admin' }),
}));
vi.mock('@/hooks/useAdminReview', () => ({
  useAdminReviewSummary: () => ({ data: { decisions_total: 12, overdue_total: 2 } }),
}));
vi.mock('@/hooks/useAdminCounts', () => ({
  useAdminCounts: () => ({ data: {}, isLoading: false }),
  readCount: () => ({ count: undefined, overdue: 0 }),
}));
vi.mock('@/hooks/useAdminNavPins', () => ({
  useAdminNavPins: () => ({ pins: [], togglePin: vi.fn(), isPinned: () => false }),
}));
// Two items where one route is a PREFIX of the other. That pairing is the
// whole point: `isItemActive` is a prefix match, so on /admin/x/deep both rows
// are "active", and an aria-current keyed on that claims the current page
// twice. Measured on a real route before the fix: three claims at once.
vi.mock('@/config/adminNavigation', () => ({
  adminNavSections: [
    {
      id: 's1',
      label: 'Section',
      icon: Box,
      defaultExpanded: true,
      minRole: 'editor',
      items: [
        { id: 'i1', label: 'Item', route: '/admin/x', icon: Box },
        {
          id: 'i2',
          label: 'Deep',
          route: '/admin/x/deep',
          icon: Layers,
          group: 'Content',
          keywords: ['countries'],
        },
        { id: 'i3', label: 'Trash', route: '/admin/trash', icon: Box },
      ],
    },
  ],
  resolveItemMinRole: () => 'editor',
}));

import { AdminSidebar } from '../AdminSidebar';

const at = (path: string) => {
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <AdminSidebar />
    </MemoryRouter>,
  );
  const section = screen.getAllByRole('button', { name: /SECTION/ }).at(-1)!;
  if (section.getAttribute('aria-expanded') === 'false') fireEvent.click(section);
  return result;
};

describe('AdminSidebar', () => {
  it('opens a labelled section from the compact navigation rail', () => {
    at('/admin/x/deep');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.queryByRole('link', { name: 'Deep' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Section navigation' }));
    expect(screen.getByRole('link', { name: 'Deep' })).toBeVisible();
  });

  it('keeps the current destination reachable when its section is collapsed', () => {
    const { container } = at('/admin/x/deep');
    fireEvent.click(screen.getByRole('button', { name: /SECTION/ }));
    expect(container.querySelector('a[href="/admin/x/deep"]')).not.toBeNull();
    expect(container.querySelector('a[href="/admin/x"]')).toBeNull();
  });
  it('searches aliases and section names', () => {
    at('/admin/x/deep');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search navigation' }), {
      target: { value: 'countries' },
    });
    expect(screen.getByRole('link', { name: 'Deep' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Item' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search navigation' }), {
      target: { value: 'section' },
    });
    expect(screen.getByRole('link', { name: 'Item' })).toBeVisible();
  });

  it('keeps ungrouped destinations after the preceding content group', () => {
    const { container } = at('/admin/x/deep');
    const routes = [...container.querySelectorAll('a[href^="/admin"]')].map((link) =>
      link.getAttribute('href'),
    );
    expect(routes).toEqual(['/admin/x', '/admin/x/deep', '/admin/trash']);
  });

  it('does not mark a partial path segment as current', () => {
    const { container } = at('/admin/x-extra');
    expect(container.querySelector('[aria-current="page"]')).toBeNull();
  });

  it('renders sections + items', () => {
    const { container } = at('/admin');
    expect(container).toBeTruthy();
  });

  // A <button onClick={navigate}> moves you to the route but has no
  // destination the browser can see: no cmd/middle-click into a new tab, no
  // "copy link", no status-bar preview, and the a11y tree says "button".
  // Caught by an `a[href^="/admin"]` probe of the mobile drawer returning zero
  // while the drawer was in fact fine (#3449 audit).
  it('renders each nav item as a real link to its route', () => {
    const { container } = at('/admin');
    const link = container.querySelector('a[href="/admin/x"]');
    expect(link, 'nav item is not an anchor with an href').not.toBeNull();
    expect(link!.textContent).toContain('Item');
    // Positive control: an anchor with no href is still keyboard-inert and
    // would satisfy a laxer `querySelector('a')`.
    expect(container.querySelectorAll('a:not([href])')).toHaveLength(0);
  });

  it('marks the active item with aria-current, and only when active', () => {
    const active = at('/admin/x').container.querySelector('a[href="/admin/x"]');
    expect(active?.getAttribute('aria-current')).toBe('page');

    const inactive = at('/admin/elsewhere').container.querySelector('a[href="/admin/x"]');
    expect(inactive?.getAttribute('aria-current')).toBeNull();
  });

  // `aria-current="page"` identifies ONE element. Keying it on the prefix
  // match that drives the highlight makes every ancestor row claim the page
  // too — measured on /admin/content/venues, three elements claimed it.
  it('lets exactly one row claim the current page, the most specific one', () => {
    const { container } = at('/admin/x/deep');
    const claimed = [...container.querySelectorAll('[aria-current="page"]')].map((el) =>
      el.getAttribute('href'),
    );
    expect(claimed).toEqual(['/admin/x/deep']);
  });

  // The pin sits next to the row, never inside it. Nesting a control in an
  // anchor is invalid HTML and axe `nested-interactive` (serious) — the same
  // violation it was when the row was a <button>, so the Link conversion must
  // not quietly re-introduce it.
  it('keeps the pin control outside the nav link', () => {
    const { container } = at('/admin');
    const link = container.querySelector('a[href="/admin/x"]')!;
    expect(link.querySelector('button'), 'pin is nested inside the nav link').toBeNull();
    expect(container.querySelector('button[aria-label="Pin Item"]')).not.toBeNull();
  });
});
