/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCMSShortcuts, type CMSShortcutHandlers } from '../useCMSShortcuts';

function makeHandlers(): CMSShortcutHandlers {
  return {
    onPalette: vi.fn(),
    onSave: vi.fn(),
    onPublish: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
  };
}

function press(key: string, opts: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  Object.defineProperty(event, 'target', { configurable: true, value: opts.target ?? document.body });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('useCMSShortcuts — modifier combos', () => {
  it.each([
    [{ key: 'k', metaKey: true }, 'onPalette'],
    [{ key: 's', metaKey: true }, 'onSave'],
    [{ key: 'Enter', metaKey: true }, 'onPublish'],
    [{ key: 'k', ctrlKey: true }, 'onPalette'],
  ] as const)('%o → %s', (opts, handlerName) => {
    const handlers = makeHandlers();
    renderHook(() => useCMSShortcuts(handlers));
    press(opts.key, opts);
    expect(handlers[handlerName as keyof CMSShortcutHandlers]).toHaveBeenCalledTimes(1);
  });

  it('Cmd+S without handler is a no-op (does not preventDefault)', () => {
    renderHook(() => useCMSShortcuts({ onPalette: vi.fn() }));
    const e = press('s', { metaKey: true });
    expect(e.defaultPrevented).toBe(false);
  });
});

describe('J/K navigation', () => {
  it('j → onNext, k → onPrev when not typing', () => {
    const handlers = makeHandlers();
    renderHook(() => useCMSShortcuts(handlers));

    press('j');
    expect(handlers.onNext).toHaveBeenCalled();

    press('k');
    expect(handlers.onPrev).toHaveBeenCalled();
  });

  it('j/k suppressed inside an input', () => {
    const handlers = makeHandlers();
    renderHook(() => useCMSShortcuts(handlers));

    const input = document.createElement('input');
    document.body.appendChild(input);

    press('j', { target: input as unknown as EventTarget });
    expect(handlers.onNext).not.toHaveBeenCalled();
  });

  it('j/k suppressed inside contentEditable elements', () => {
    const handlers = makeHandlers();
    renderHook(() => useCMSShortcuts(handlers));

    const ce = document.createElement('div');
    // jsdom doesn't wire isContentEditable to the contentEditable attribute,
    // so set the getter explicitly for the assertion.
    Object.defineProperty(ce, 'isContentEditable', { configurable: true, value: true });
    document.body.appendChild(ce);

    press('j', { target: ce as unknown as EventTarget });
    expect(handlers.onNext).not.toHaveBeenCalled();
  });

  it('j/k suppressed inside .ProseMirror', () => {
    const handlers = makeHandlers();
    renderHook(() => useCMSShortcuts(handlers));

    const editor = document.createElement('div');
    editor.className = 'ProseMirror';
    const inner = document.createElement('span');
    editor.appendChild(inner);
    document.body.appendChild(editor);

    press('j', { target: inner as unknown as EventTarget });
    expect(handlers.onNext).not.toHaveBeenCalled();
  });

  it('j+modifier is ignored (no preventDefault)', () => {
    const handlers = makeHandlers();
    renderHook(() => useCMSShortcuts(handlers));
    press('j', { altKey: true });
    expect(handlers.onNext).not.toHaveBeenCalled();
  });
});

describe('Cleanup', () => {
  it('unmount removes the listener', () => {
    const handlers = makeHandlers();
    const { unmount } = renderHook(() => useCMSShortcuts(handlers));
    unmount();
    press('j');
    expect(handlers.onNext).not.toHaveBeenCalled();
  });
});
