import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

let mockUser: { id: string } | null = null;
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }));

import { AuthGate } from '../AuthGate';

describe('AuthGate', () => {
  it('should show sign-in prompt when not authenticated', () => {
    mockUser = null;
    render(<MemoryRouter><AuthGate title="Messages"><div>Secret</div></AuthGate></MemoryRouter>);
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('should render children when authenticated', () => {
    mockUser = { id: 'u-1' };
    render(<MemoryRouter><AuthGate title="Messages"><div>Secret Content</div></AuthGate></MemoryRouter>);
    expect(screen.getByText('Secret Content')).toBeInTheDocument();
    expect(screen.queryByText('Sign In')).not.toBeInTheDocument();
  });

  it('should show custom description', () => {
    mockUser = null;
    render(<MemoryRouter><AuthGate title="Test" description="Custom desc"><div /></AuthGate></MemoryRouter>);
    expect(screen.getByText('Custom desc')).toBeInTheDocument();
  });
});
