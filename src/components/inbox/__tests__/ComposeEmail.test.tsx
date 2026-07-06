/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// Tiptap's ProseMirror view can't mount in jsdom (viewport tracking); mock it
// out — same approach as RichTextEditor's own test.
vi.mock('@tiptap/react', () => ({ useEditor: () => null, EditorContent: () => null }));
vi.mock('@/hooks/useMailbox', () => ({ useMailbox: () => ({ sendEmail: vi.fn(), sending: false }) }));
vi.mock('@/hooks/useMailboxAddress', () => ({ useMailboxAddress: () => ({ fullEmail: 'u@example.com' }) }));

import { ComposeEmail } from '../ComposeEmail';

describe('ComposeEmail', () => {
  it('renders', () => {
    const { container } = render(<ComposeEmail />);
    expect(container).toBeTruthy();
  });
});
