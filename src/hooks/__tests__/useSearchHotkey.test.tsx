import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSearchHotkey } from '../useSearchHotkey';

describe('useSearchHotkey', () => {
  it('fires on Cmd/Ctrl+K', () => {
    const handler = vi.fn();
    renderHook(() => useSearchHotkey(handler));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    expect(handler).toHaveBeenCalled();
  });

  it('does not fire when typing in a regular input', () => {
    const handler = vi.fn();
    renderHook(() => useSearchHotkey(handler));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('does fire when ⌘K is pressed inside the combobox itself', () => {
    const handler = vi.fn();
    renderHook(() => useSearchHotkey(handler));
    const input = document.createElement('input');
    input.setAttribute('role', 'combobox');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    expect(handler).toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
