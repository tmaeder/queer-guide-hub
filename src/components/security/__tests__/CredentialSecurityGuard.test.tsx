import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => ({ isAdmin: true }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

import { CredentialSecurityGuard } from '../CredentialSecurityGuard';

describe('CredentialSecurityGuard', () => {
  it('should render children when admin', () => {
    render(<CredentialSecurityGuard><div>Protected Content</div></CredentialSecurityGuard>);
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
