/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('../AdminSidebar', () => ({ AdminSidebar: () => <nav data-testid="sidebar" /> }));
vi.mock('@/config/adminNavigation', () => ({
  getBreadcrumbsForRoute: () => [{ label: 'Admin' }, { label: 'Dashboard' }],
}));
vi.mock('@/components/cms/editor/CMSEditorLayout', () => ({
  CMSEditorLayout: () => <div data-testid="editor" />,
}));

import { AdminShell } from '../AdminShell';

describe('AdminShell', () => {
  it('renders sidebar + outlet content', () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route path="/admin/*" element={<AdminShell />}>
            <Route path="dashboard" element={<div>page content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });
});
