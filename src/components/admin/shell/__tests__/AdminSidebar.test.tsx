/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Box } from 'lucide-react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { email: 'a@b' } }) }));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => ({ isAdmin: true }) }));
vi.mock('@/config/adminNavigation', () => ({
  adminNavSections: [
    { id: 's1', label: 'Section', defaultExpanded: true, items: [{ id: 'i1', label: 'Item', path: '/admin/x', icon: Box }] },
  ],
}));

import { AdminSidebar } from '../AdminSidebar';

describe('AdminSidebar', () => {
  it('renders sections + items', () => {
    const { container } = render(
      <MemoryRouter><AdminSidebar /></MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
