/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useEmailForwardingAddress', () => ({
  useEmailForwardingAddress: () => ({ data: 'inbox@example.com', isLoading: false }),
  useRotateEmailForwardingAddress: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { EmailForwardingSettings } from '../EmailForwardingSettings';

describe('EmailForwardingSettings', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><EmailForwardingSettings /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
