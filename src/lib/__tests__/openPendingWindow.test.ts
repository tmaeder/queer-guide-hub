/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPendingWindow } from '../openPendingWindow';

function fakeWindow() {
  return {
    opener: {} as unknown,
    closed: false,
    location: { href: 'about:blank' },
    close: vi.fn(),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('openPendingWindow', () => {
  it('opens a blank window now, without noopener, and severs the opener by hand', () => {
    const win = fakeWindow();
    const open = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    openPendingWindow('_blank');
    // noopener as a feature would make window.open() return null by spec,
    // leaving nothing to navigate once the URL arrives.
    expect(open).toHaveBeenCalledWith('about:blank', '_blank', undefined);
    expect(win.opener).toBeNull();
  });

  it('navigates the pending window once the URL is known', () => {
    const win = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    const pending = openPendingWindow();
    expect(pending.navigate('https://files.example/doc.pdf')).toBe(true);
    expect(win.location.href).toBe('https://files.example/doc.pdf');
  });

  it('reports false when the popup was blocked or closed meanwhile', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openPendingWindow().navigate('https://x.example')).toBe(false);

    const win = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    const pending = openPendingWindow();
    win.closed = true;
    expect(pending.navigate('https://x.example')).toBe(false);
  });

  it('close() closes the window it opened', () => {
    const win = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    openPendingWindow().close();
    expect(win.close).toHaveBeenCalledTimes(1);
  });
});
