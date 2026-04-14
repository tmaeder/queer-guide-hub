import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => ({ isAdmin: false }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

import { LocationPrivacyGuard } from '../LocationPrivacyGuard';

describe('LocationPrivacyGuard', () => {
  it('should show children when location is public', () => {
    render(
      <LocationPrivacyGuard profileUserId="other" privacySettings={{ location_public: true }}>
        <div>Location Data</div>
      </LocationPrivacyGuard>
    );
    expect(screen.getByText('Location Data')).toBeInTheDocument();
  });

  it('should show children for own profile', () => {
    render(
      <LocationPrivacyGuard profileUserId="u-1" privacySettings={{}}>
        <div>My Location</div>
      </LocationPrivacyGuard>
    );
    expect(screen.getByText('My Location')).toBeInTheDocument();
  });
});
