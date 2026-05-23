/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Box } from 'lucide-react';

// Two content types so we know it iterates the whole registry.
vi.mock('@/config/contentTypeRegistry', () => ({
  contentTypeRegistry: {
    venues: {
      id: 'venues',
      label: { singular: 'Venue', plural: 'Venues' },
    },
    events: {
      id: 'events',
      label: { singular: 'Event', plural: 'Events' },
    },
  },
}));

const openEditor = vi.fn();
vi.mock('@/components/admin/shell/AdminShell', () => ({
  useAdminShell: () => ({ openEditor, closeEditor: () => {} }),
}));

vi.mock('@/config/adminNavigation', () => ({
  adminNavSections: [],
}));

import { AdminCommandActionsProvider } from '../useAdminCommandActions';
import { GlobalAdminActions } from '../useGlobalAdminActions';
import { AdminCommandPalette } from '../AdminCommandPalette';

describe('GlobalAdminActions', () => {
  it('registers a "New <type>" action per content type and dispatches openEditor', () => {
    render(
      <MemoryRouter>
        <AdminCommandActionsProvider>
          <GlobalAdminActions />
          <AdminCommandPalette open onOpenChange={() => {}} />
        </AdminCommandActionsProvider>
      </MemoryRouter>,
    );

    // Both labels are listed.
    expect(screen.getByText('New Venue')).toBeTruthy();
    expect(screen.getByText('New Event')).toBeTruthy();

    fireEvent.click(screen.getByText('New Event'));
    expect(openEditor).toHaveBeenCalledWith('events', null);
  });
});
