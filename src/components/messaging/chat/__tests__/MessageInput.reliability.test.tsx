import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageInput } from '../MessageInput';
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? '',
  }),
}));
vi.mock('@/components/messaging/EmojiPicker', () => ({ EmojiPicker: () => null }));
vi.mock('@/components/messaging/StickerPicker', () => ({ StickerPicker: () => null }));
const defaults = { onTyping: vi.fn(), onStopTyping: vi.fn() };
beforeEach(() => sessionStorage.clear());
describe('reliable composer', () => {
  it('keeps the draft during a pending request, prevents duplicate sends, and clears only on success', async () => {
    let finish!: (success: boolean) => void;
    const send = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    render(<MessageInput {...defaults} onSend={send} draftKey="u1:c1" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Meet at seven?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox')).toHaveValue('Meet at seven?');
    expect(sessionStorage.getItem('chat-draft:u1:c1')).toBe('Meet at seven?');
    await act(async () => finish(true));
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(sessionStorage.getItem('chat-draft:u1:c1')).toBeNull();
  });
  it.each(['false', 'reject'])('retains failed drafts and retries after %s', async (failure) => {
    const send = vi
      .fn()
      .mockImplementationOnce(() =>
        failure === 'false' ? false : Promise.reject(new Error('offline')),
      )
      .mockResolvedValueOnce(true);
    render(<MessageInput {...defaults} onSend={send} draftKey="u1:c1" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your draft is safe');
    expect(screen.getByRole('textbox')).toHaveValue('Keep this draft');
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
    expect(send).toHaveBeenNthCalledWith(2, 'Keep this draft');
  });
  it('restores drafts separately for each account and conversation after unmount', () => {
    const first = render(<MessageInput {...defaults} onSend={vi.fn()} draftKey="u1:c1" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'First thread' } });
    first.unmount();
    const second = render(<MessageInput {...defaults} onSend={vi.fn()} draftKey="u1:c2" />);
    expect(screen.getByRole('textbox')).toHaveValue('');
    second.unmount();
    const third = render(<MessageInput {...defaults} onSend={vi.fn()} draftKey="u2:c1" />);
    expect(screen.getByRole('textbox')).toHaveValue('');
    third.unmount();
    render(<MessageInput {...defaults} onSend={vi.fn()} draftKey="u1:c1" />);
    expect(screen.getByRole('textbox')).toHaveValue('First thread');
  });
  it('supports multiline text and leaves IME Enter to the input method', async () => {
    const send = vi.fn();
    const user = userEvent.setup();
    render(<MessageInput {...defaults} onSend={send} />);
    const input = screen.getByRole('textbox');
    await user.type(input, 'Hello{Shift>}{Enter}{/Shift}there');
    expect(input).toHaveValue('Hello\nthere');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 });
    expect(send).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(send).toHaveBeenCalledWith('Hello\nthere');
  });
  it('uses Return for a newline on phone keyboards and keeps the Send button available', () => {
    const media = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue({ matches: true } as MediaQueryList);
    const send = vi.fn();
    render(<MessageInput {...defaults} onSend={send} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Phone draft' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(send).toHaveBeenCalledWith('Phone draft');
    media.mockRestore();
  });

  it('retains an image and its caption after a failed send', async () => {
    const clear = vi.fn();
    const send = vi.fn().mockResolvedValue(false);
    render(
      <MessageInput
        {...defaults}
        onSend={send}
        onClearImage={clear}
        pendingImage={{
          url: '/photo.webp',

          path: 'u1/photo.webp',
          width: 100,
          height: 100,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Remove image' })).toBeVisible();
    expect(clear).not.toHaveBeenCalled();
  });
});
