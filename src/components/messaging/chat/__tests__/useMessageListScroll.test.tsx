import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessageListScroll } from '../useMessageListScroll';
import type { Message } from '@/hooks/useMessaging';
const scroll = vi.fn();
const message = (id: string, sender_id = 'other') => ({ id, sender_id }) as Message;
function Probe({ messages, older = () => {} }: { messages: Message[]; older?: () => void }) {
  const { scrollRootRef, messagesEndRef, hasNewMessages, jumpToLatest } = useMessageListScroll(
    'c1',
    messages,
    older,
    'me',
  );
  return (
    <div ref={scrollRootRef}>
      <div data-radix-scroll-area-viewport data-testid="viewport">
        <div ref={messagesEndRef} />
      </div>
      {hasNewMessages && <button onClick={jumpToLatest}>New messages</button>}
    </div>
  );
}
beforeEach(() => {
  scroll.mockClear();
  Element.prototype.scrollIntoView = scroll;
});
function dimensions(viewport: HTMLElement, height: number) {
  Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: height });
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 400 });
}
describe('conversation reading position', () => {
  it('leaves the reader in place for incoming messages and offers a jump action', () => {
    const view = render(<Probe messages={[message('a')]} />);
    const viewport = screen.getByTestId('viewport');
    dimensions(viewport, 1600);
    viewport.scrollTop = 250;
    fireEvent.scroll(viewport);
    scroll.mockClear();
    view.rerender(<Probe messages={[message('a'), message('b')]} />);
    expect(scroll).not.toHaveBeenCalled();
    expect(viewport.scrollTop).toBe(250);
    fireEvent.click(screen.getByRole('button', { name: 'New messages' }));
    expect(scroll).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'New messages' })).toBeNull();
  });
  it('preserves the visible content when older history is prepended', () => {
    const older = vi.fn();
    const view = render(<Probe messages={[message('b')]} older={older} />);
    const viewport = screen.getByTestId('viewport');
    dimensions(viewport, 1600);
    viewport.scrollTop = 40;
    fireEvent.scroll(viewport);
    expect(older).toHaveBeenCalled();
    dimensions(viewport, 2000);
    scroll.mockClear();
    view.rerender(<Probe messages={[message('a'), message('b')]} older={older} />);
    expect(viewport.scrollTop).toBe(440);
    expect(scroll).not.toHaveBeenCalled();
  });
  it('follows an outgoing message even when the reader had scrolled up', () => {
    const view = render(<Probe messages={[message('a')]} />);
    const viewport = screen.getByTestId('viewport');
    dimensions(viewport, 1600);
    viewport.scrollTop = 250;
    fireEvent.scroll(viewport);
    scroll.mockClear();
    view.rerender(<Probe messages={[message('a'), message('b', 'me')]} />);
    expect(scroll).toHaveBeenCalled();
  });
});
