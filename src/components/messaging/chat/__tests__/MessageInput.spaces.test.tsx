/**
 * The composer must accept a space.
 *
 * `handleInputChange` used to run the submit-time sanitizer on every keystroke,
 * and that sanitizer ends in `.trim()`. The input is CONTROLLED, so a space typed
 * at the end of the value was stripped before it could render — and every space is
 * trailing at the moment you type it, so a space was impossible ANYWHERE in a
 * message, not merely at the edges. Reported from /hub/messages on 2026-10-06:
 * "wenn ich versuche eine Nachricht zu schreiben, kann ich kein Leerzeichen
 * eingeben."
 *
 * Both halves are asserted, because each passes on its own with the bug back:
 *  - the VALUE the user sees must keep its spaces while typing, and
 *  - onSend must still receive sanitized, trimmed text (the fix must not move the
 *    XSS strip off the submit path to buy the space back).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageInput } from '../MessageInput';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? '',
  }),
}));
vi.mock('@/components/messaging/EmojiPicker', () => ({ EmojiPicker: () => null }));
vi.mock('@/components/messaging/StickerPicker', () => ({ StickerPicker: () => null }));
vi.mock('@/lib/icebreakers', () => ({ pickIcebreaker: () => 'hi' }));

const noop = () => {};

describe('MessageInput spaces', () => {
  it('keeps a space the user types between two words', async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={noop} onTyping={noop} onStopTyping={noop} />);
    const box = screen.getByRole('textbox');

    await user.type(box, 'hallo welt');

    // With the per-keystroke trim back, this reads 'hallowelt'.
    expect(box).toHaveValue('hallo welt');
  });

  it('keeps interior spaces but still sends trimmed, tag-stripped text', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} onTyping={noop} onStopTyping={noop} />);
    const box = screen.getByRole('textbox');

    await user.type(box, 'a b c');
    expect(box).toHaveValue('a b c');

    await user.type(box, '{Enter}');
    expect(onSend).toHaveBeenCalledWith('a b c');
  });

  it('still strips markup and edge whitespace on submit', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} onTyping={noop} onStopTyping={noop} />);
    const box = screen.getByRole('textbox');

    await user.type(box, '  <b>bold</b> text  {Enter}');

    expect(onSend).toHaveBeenCalledWith('bold text');
  });
});
