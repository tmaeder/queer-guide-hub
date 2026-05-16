/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useMailboxAddress', () => ({
  useMailboxAddress: () => ({
    currentAddress: null,
    fullEmail: null,
    checkAvailability: vi.fn().mockResolvedValue({ available: true }),
    claimAddress: vi.fn().mockResolvedValue({ ok: true }),
  }),
}));

import { MailboxSettings } from '../MailboxSettings';

describe('MailboxSettings', () => {
  it('renders', () => {
    const { container } = render(<MailboxSettings />);
    expect(container).toBeTruthy();
  });
});
