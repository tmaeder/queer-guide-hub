/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useMailbox', () => ({ useMailbox: () => ({ sendEmail: vi.fn(), sending: false }) }));
vi.mock('@/hooks/useMailboxAddress', () => ({ useMailboxAddress: () => ({ fullEmail: 'u@example.com' }) }));

import { ComposeEmail } from '../ComposeEmail';

describe('ComposeEmail', () => {
  it('renders', () => {
    const { container } = render(<ComposeEmail />);
    expect(container).toBeTruthy();
  });
});
