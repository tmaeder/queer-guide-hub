/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const send = vi.hoisted(() => vi.fn());
// Tiptap's ProseMirror view can't mount in jsdom (viewport tracking); mock it
// out — same approach as RichTextEditor's own test.
vi.mock('@tiptap/react', () => ({ useEditor: () => null, EditorContent: () => null }));
vi.mock('@/hooks/useMailbox', () => ({ useMailbox: () => ({ sendEmail: send, sending: false }) }));
vi.mock('@/hooks/useMailboxAddress', () => ({
  useMailboxAddress: () => ({ fullEmail: 'u@example.com' }),
}));

import { ComposeEmail } from '../ComposeEmail';

describe('ComposeEmail', () => {
  it('renders', () => {
    const { container } = render(<ComposeEmail />);
    expect(container).toBeTruthy();
  });
});

it('returns the canonical saved copy to the reader after a successful send', async () => {
  const id = '88888888-0000-4000-8000-000000000030';
  send.mockResolvedValue({ email_id: id });
  const onSent = vi.fn();
  render(<ComposeEmail onSent={onSent} />);
  fireEvent.change(screen.getByPlaceholderText('recipient@example.com'), {
    target: { value: 'contact@example.invalid' },
  });
  fireEvent.change(screen.getByPlaceholderText('Email subject'), {
    target: { value: 'Requested service reply' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(onSent).toHaveBeenCalledWith(id));
});
