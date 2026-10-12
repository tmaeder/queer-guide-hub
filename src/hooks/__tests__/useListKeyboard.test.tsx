/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useListKeyboard } from '../useListKeyboard';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

function press(key: string, target?: HTMLElement) {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  if (target) Object.defineProperty(e, 'target', { value: target });
  window.dispatchEvent(e);
  return e;
}

describe('useListKeyboard', () => {
  it('leaves native activation to a focused control without stealing row shortcuts', () => {
    const action = vi.fn();
    const navigate = vi.fn();
    renderHook(() =>
      useListKeyboard({
        items,
        activeId: 'a',
        onNavigate: navigate,
        actions: { Enter: action, ' ': action },
        enabled: true,
      }),
    );
    const button = document.createElement('button');
    expect(press('Enter', button).defaultPrevented).toBe(false);
    expect(press(' ', button).defaultPrevented).toBe(false);
    expect(action).not.toHaveBeenCalled();
    press('j', button);
    expect(navigate).toHaveBeenCalledWith('b');
    press('Enter');
    expect(action).toHaveBeenCalledOnce();
  });

  it('does not navigate behind a dialog or while editing rich text', () => {
    const navigate = vi.fn();
    renderHook(() =>
      useListKeyboard({ items, activeId: 'a', onNavigate: navigate, enabled: true }),
    );
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.append(button);
    press('j', button);
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    press('j', editor);
    expect(navigate).not.toHaveBeenCalled();
  });

  let onNavigate: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    onNavigate = vi.fn();
  });

  it('j / ArrowDown move to the next item, k / ArrowUp to the previous', () => {
    renderHook(() => useListKeyboard({ items, activeId: 'b', onNavigate, enabled: true }));
    press('j');
    expect(onNavigate).toHaveBeenLastCalledWith('c');
    press('k');
    expect(onNavigate).toHaveBeenLastCalledWith('a');
    press('ArrowDown');
    expect(onNavigate).toHaveBeenLastCalledWith('c');
    press('ArrowUp');
    expect(onNavigate).toHaveBeenLastCalledWith('a');
  });

  it('clamps at the ends', () => {
    renderHook(() => useListKeyboard({ items, activeId: 'c', onNavigate, enabled: true }));
    press('j');
    expect(onNavigate).toHaveBeenLastCalledWith('c'); // stays on last
  });

  it('fires action-map handlers and preventDefault', () => {
    const onAct = vi.fn();
    renderHook(() =>
      useListKeyboard({ items, activeId: 'a', onNavigate, actions: { x: onAct }, enabled: true }),
    );
    const e = press('x');
    expect(onAct).toHaveBeenCalledOnce();
    expect(e.defaultPrevented).toBe(true);
  });

  it('ignores keys while typing in inputs', () => {
    renderHook(() => useListKeyboard({ items, activeId: 'a', onNavigate, enabled: true }));
    const input = document.createElement('input');
    press('j', input);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const onAct = vi.fn();
    renderHook(() =>
      useListKeyboard({ items, activeId: 'a', onNavigate, actions: { x: onAct }, enabled: false }),
    );
    press('j');
    press('x');
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onAct).not.toHaveBeenCalled();
  });
});
