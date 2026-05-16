/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/inbox/UnifiedInbox', () => ({
  UnifiedInbox: () => <div data-testid="inbox" />,
}));

import Inbox from '../Inbox';

describe('Inbox page', () => {
  it('renders UnifiedInbox', () => {
    render(<Inbox />);
    expect(screen.getByTestId('inbox')).toBeInTheDocument();
  });
});
