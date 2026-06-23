/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('../AdminSidebar', () => ({ AdminSidebar: () => <nav data-testid="sidebar" /> }));
vi.mock('@/config/adminNavigation', () => ({
  adminNavSections: [],
  getBreadcrumbsForRoute: () => [{ label: 'Admin' }, { label: 'Dashboard' }],
  getRouteMinRole: () => 'editor',
}));
vi.mock('@/hooks/useGranularRoles', () => ({
  useGranularRoles: () => ({
    effectiveRole: 'admin',
    loading: false,
    can: () => true,
    canAccess: () => true,
    allowedContentTypes: ['*'],
  }),
}));
vi.mock('@/components/cms/editor/CMSEditorLayout', () => ({
  CMSEditorLayout: () => <div data-testid="editor" />,
}));

import { AdminShell } from '../AdminShell';

describe('AdminShell', () => {
  it('renders sidebar + outlet content', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <Routes>
            <Route path="/admin/*" element={<AdminShell />}>
              <Route path="dashboard" element={<div>page content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });
});
