// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import LegacyBusiness from '../AdminBusiness';
import Workspace from '../OrganisationsWorkspace';
vi.mock('@/components/cms/ContentListPanel', () => ({
  ContentListPanel: ({
    contentTypeId,
    tools,
  }: {
    contentTypeId: string;
    tools?: React.ReactNode;
  }) => (
    <div data-testid="directory">
      CMS:{contentTypeId}
      {tools}
    </div>
  ),
}));
vi.mock('@/components/cms/ContentListPanel/exportContentList', () => ({
  exportContentType: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { exportContentType } from '@/components/cms/ContentListPanel/exportContentList';
import { venueContentType } from '@/config/contentTypes/venue';
vi.mock('@/components/admin/frames/AdminArchetypeHeader', () => ({
  AdminArchetypeHeader: ({ title, actions }: { title: string; actions: React.ReactNode }) => (
    <>
      <h1>{title}</h1>
      {actions}
    </>
  ),
}));
vi.mock('@/components/admin/business/HotelsManager', () => ({
  HotelsManager: () => <div>Hotel tools</div>,
}));
vi.mock('@/components/admin/affiliate/MerchantsManager', () => ({
  MerchantsManager: () => <div>Merchant tools</div>,
}));
vi.mock('@/components/admin/AffiliatePartnersManager', () => ({
  AffiliatePartnersManager: () => <div>Partner tools</div>,
}));
vi.mock('@/components/admin/business/BrandsManager', () => ({
  BrandsManager: () => <div>Brand list tools</div>,
}));
function Destination() {
  const loc = useLocation();
  return (
    <div data-testid="destination">
      {loc.pathname}
      {loc.search}
    </div>
  );
}
afterEach(cleanup);
describe('Organisation workspace compatibility', () => {
  it.each(['Excel', 'CSV'] as const)(
    'exports the venues table itself as %s from the directory tools',
    async (format) => {
      vi.mocked(exportContentType).mockClear();
      render(
        <MemoryRouter initialEntries={['/admin/content/organizations']}>
          <Workspace />
        </MemoryRouter>,
      );
      fireEvent.click(screen.getByRole('button', { name: `Export venues (${format})` }));
      await waitFor(() => expect(exportContentType).toHaveBeenCalledTimes(1));
      expect(exportContentType).toHaveBeenCalledWith(venueContentType, [], format, {
        archivedView: 'live',
        mergedView: 'unmerged',
      });
    },
  );

  it.each([
    [
      '/admin/business?tab=merchants&role=seller',
      '/admin/content/organizations?tab=merchants&roles=seller',
    ],
    ['/admin/business/org-123?tab=hotels', '/admin/content/organizations?edit=org-123'],
    ['/admin/business?tab=review', '/admin/quality'],
  ])('redirects %s', async (source, target) => {
    render(
      <MemoryRouter initialEntries={[source]}>
        <Routes>
          <Route path="/admin/business" element={<LegacyBusiness />} />
          <Route path="/admin/business/:id" element={<LegacyBusiness />} />
          <Route path="*" element={<Destination />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('destination')).toHaveTextContent(target);
  });
  it('keeps one directory mounted while switching operations and preserves URL state', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/content/organizations?tab=hotels&view=saved-123']}>
        <Workspace />
        <Destination />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(await screen.findByText('Hotel tools')).toBeVisible();
    expect(screen.getByTestId('directory')).not.toBeVisible();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Directory' }), {
      button: 0,
      ctrlKey: false,
    });
    await waitFor(() => expect(screen.getByTestId('directory')).toBeVisible());
    expect(screen.getByTestId('destination')).not.toHaveTextContent('view=saved-123');
  });
  it.each(['directory', 'hotels', 'merchants', 'brands', 'partners'])(
    'connects the selected %s tab to a panel',
    async (tab) => {
      render(
        <MemoryRouter initialEntries={[`/admin/content/organizations?tab=${tab}`]}>
          <Workspace />
        </MemoryRouter>,
      );
      await waitFor(() => {
        const selected = screen
          .getAllByRole('tab')
          .find((node) => node.getAttribute('aria-selected') === 'true');
        expect(selected).toBeTruthy();
        const panel = document.getElementById(selected!.getAttribute('aria-controls')!);
        expect(panel).toHaveAttribute('role', 'tabpanel');
        expect(panel).toHaveAttribute('aria-labelledby', selected!.id);
      });
    },
  );

  it('shows the all-brands manager in the common workspace', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/content/organizations?tab=brands']}>
        <Workspace />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Brand list tools')).toBeVisible();
  });
});
