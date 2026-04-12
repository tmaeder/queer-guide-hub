import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let mockUser: any = { id: 'u-1' };
let mockIsAdmin = false;
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => ({ isAdmin: mockIsAdmin }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

import { PrivacyGuard } from '../PrivacyGuard';

describe('PrivacyGuard', () => {
  it('should show content to profile owner', () => {
    mockUser = { id: 'owner-1' };
    mockIsAdmin = false;
    render(<PrivacyGuard profileUserId="owner-1" requiredPrivacyField="bio_public"><div>Secret Bio</div></PrivacyGuard>);
    expect(screen.getByText('Secret Bio')).toBeInTheDocument();
  });

  it('should show content when privacy setting is public', () => {
    mockUser = { id: 'viewer' };
    mockIsAdmin = false;
    render(<PrivacyGuard profileUserId="other" requiredPrivacyField="bio_public" privacySettings={{ bio_public: true }}><div>Public Bio</div></PrivacyGuard>);
    expect(screen.getByText('Public Bio')).toBeInTheDocument();
  });

  it('should hide content when privacy setting is private', () => {
    mockUser = { id: 'viewer' };
    mockIsAdmin = false;
    render(<PrivacyGuard profileUserId="other" requiredPrivacyField="bio_public" privacySettings={{ bio_public: false }}><div>Private Bio</div></PrivacyGuard>);
    expect(screen.queryByText('Private Bio')).not.toBeInTheDocument();
  });

  it('should show fallback when content is private', () => {
    mockUser = { id: 'viewer' };
    mockIsAdmin = false;
    render(<PrivacyGuard profileUserId="other" requiredPrivacyField="bio_public" fallback={<div>Hidden</div>}><div>Secret</div></PrivacyGuard>);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });

  it('should show content to admin with override', () => {
    mockUser = { id: 'admin-1' };
    mockIsAdmin = true;
    render(<PrivacyGuard profileUserId="other" requiredPrivacyField="bio_public"><div>Admin Access</div></PrivacyGuard>);
    expect(screen.getByText('Admin Access')).toBeInTheDocument();
  });

  it('should default to private when no settings provided', () => {
    mockUser = { id: 'viewer' };
    mockIsAdmin = false;
    render(<PrivacyGuard profileUserId="other" requiredPrivacyField="bio_public"><div>Secret</div></PrivacyGuard>);
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });
});
