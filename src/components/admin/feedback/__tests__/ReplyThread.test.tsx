/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/utils/timezone', () => ({ timeAgo: () => '1m ago' }));
vi.mock('@/components/icons/brand', () => ({ Github: () => <svg /> }));

import { ReplyThread } from '../ReplyThread';

describe('ReplyThread', () => {
  it('renders header with no replies', () => {
    render(<ReplyThread replies={[]} contactEmail="x@y.com" onSend={vi.fn()} isSending={false} />);
    expect(screen.getByText(/Conversation/)).toBeInTheDocument();
  });

  it('renders one block per reply', () => {
    render(
      <ReplyThread
        replies={[
          { at: '2026-05-15T00:00:00Z', by_name: 'Alice', body: 'Hello', emailed: false, opened_at: null, delivered_at: null, bounced_at: null, github_url: null, email_error: null } as never,
          { at: '2026-05-15T01:00:00Z', by_name: 'GH:Bot', body: 'Auto reply', emailed: false } as never,
        ]}
        contactEmail={null}
        onSend={vi.fn()}
        isSending={false}
      />,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Bot')).toBeInTheDocument();
  });

  it('Send disabled until text typed', () => {
    render(<ReplyThread replies={[]} contactEmail="x@y.com" onSend={vi.fn()} isSending={false} />);
    expect(screen.getByRole('button')).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Reply to/), { target: { value: 'hi' } });
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('Send calls onSend with body + notify', () => {
    const onSend = vi.fn();
    render(<ReplyThread replies={[]} contactEmail="x@y.com" onSend={onSend} isSending={false} />);
    fireEvent.change(screen.getByPlaceholderText(/Reply to/), { target: { value: 'yo' } });
    fireEvent.click(screen.getByRole('button'));
    expect(onSend).toHaveBeenCalledWith('yo', true);
  });

  it('shows MailX hint when no contact email', () => {
    render(<ReplyThread replies={[]} contactEmail={null} onSend={vi.fn()} isSending={false} />);
    expect(screen.getByText(/comment stays internal/)).toBeInTheDocument();
  });

  it("shows 'Save comment' label when no email", () => {
    render(<ReplyThread replies={[]} contactEmail={null} onSend={vi.fn()} isSending={false} />);
    fireEvent.change(screen.getByPlaceholderText(/internal comment/), { target: { value: 'yo' } });
    expect(screen.getByRole('button', { name: /Save comment/ })).toBeInTheDocument();
  });
});
