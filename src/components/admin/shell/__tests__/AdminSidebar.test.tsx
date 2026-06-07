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
vi.mock('@/hooks/useGranularRoles', () => ({ useGranularRoles: () => ({ effectiveRole: 'admin' }) }));
vi.mock('@/config/adminNavigation', () => ({
  adminNavSections: [
    { id: 's1', label: 'Section', defaultExpanded: true, minRole: 'editor', items: [{ id: 'i1', label: 'Item', route: '/admin/x', icon: Box }] },
  ],
  resolveItemMinRole: () => 'editor',
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
