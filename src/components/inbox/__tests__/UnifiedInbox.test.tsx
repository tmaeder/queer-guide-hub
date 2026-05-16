/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useUnifiedInbox', () => ({
  useUnifiedInbox: () => ({
    items: [],
    loading: false,
    refresh: vi.fn(),
    totalUnread: 0,
    mailbox: { selectedFolder: 'inbox', setSelectedFolder: vi.fn(), folders: [], emails: [], loading: false },
  }),
}));
vi.mock('@/hooks/useMailboxAddress', () => ({ useMailboxAddress: () => ({ fullEmail: null, currentAddress: null }) }));
vi.mock('@/hooks/useMailbox', () => ({ useMailbox: () => ({ emails: [], folders: [], loading: false }) }));

import { UnifiedInbox } from '../UnifiedInbox';

describe('UnifiedInbox', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><UnifiedInbox /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
