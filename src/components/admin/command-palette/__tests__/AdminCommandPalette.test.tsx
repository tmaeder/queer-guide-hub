/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box } from 'lucide-react';

const navigateMock = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/config/adminNavigation', () => ({
  adminNavSections: [
    {
      id: 's1',
      label: 'Cockpit',
      icon: Box,
      items: [{ id: 'overview', label: 'Overview', icon: Box, route: '/admin' }],
    },
    {
      id: 's2',
      label: 'Content',
      icon: Box,
      items: [{ id: 'venues', label: 'Venues', icon: Box, route: '/admin/content/venues' }],
    },
  ],
  resolveItemMinRole: () => 'editor',
}));
vi.mock('@/hooks/useGranularRoles', () => ({
  useGranularRoles: () => ({ effectiveRole: 'admin' }),
}));

import { AdminCommandPalette } from '../AdminCommandPalette';
import { AdminCommandActionsProvider } from '../useAdminCommandActions';

describe('AdminCommandPalette', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    localStorage.clear();
  });

  it('navigates on selecting a nav item', () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <MemoryRouter>
          <AdminCommandActionsProvider>
            <AdminCommandPalette open onOpenChange={() => {}} />
          </AdminCommandActionsProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const venues = screen.getByText('Venues');
    fireEvent.click(venues);
    expect(navigateMock).toHaveBeenCalledWith('/admin/content/venues');
  });

  it('filters by search input', () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <MemoryRouter>
          <AdminCommandActionsProvider>
            <AdminCommandPalette open onOpenChange={() => {}} />
          </AdminCommandActionsProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const input = screen.getByPlaceholderText(/jump to page/i);
    fireEvent.change(input, { target: { value: 'venues' } });
    expect(screen.getByText('Venues')).toBeTruthy();
    expect(screen.queryByText('Overview')).toBeNull();
  });
});
