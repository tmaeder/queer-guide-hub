/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFeedbackShortcuts, shortcutHelp } from '../useFeedbackShortcuts';

function makeHandlers() {
  return {
    onFocusSearch: vi.fn(),
    onOpenPalette: vi.fn(),
    onOpenHelp: vi.fn(),
    onEscape: vi.fn(),
    onMoveCard: vi.fn(),
    onOpenFocused: vi.fn(),
    onSetStatusIndex: vi.fn(),
    onSetPriority: vi.fn(),
    onAssignPicker: vi.fn(),
    onForwardFocused: vi.fn(),
    onCopyHandoff: vi.fn(),
    onToggleSelectFocused: vi.fn(),
  };
}

function press(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
}

describe('useFeedbackShortcuts', () => {
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    vi.useFakeTimers();
    handlers = makeHandlers();
    // Make sure document.activeElement is body (non-typing).
    document.body.focus();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Disabled', () => {
    it('does not attach listeners when disabled', () => {
      renderHook(() => useFeedbackShortcuts(false, handlers));
      press('j');
      expect(handlers.onMoveCard).not.toHaveBeenCalled();
    });
  });

  describe('Navigation keys', () => {
    beforeEach(() => {
      renderHook(() => useFeedbackShortcuts(true, handlers));
    });

    it.each([
      ['j', 'down'],
      ['k', 'up'],
      ['h', 'left'],
      ['l', 'right'],
    ])('routes %s to onMoveCard(%s)', (key, dir) => {
      press(key);
      expect(handlers.onMoveCard).toHaveBeenCalledWith(dir);
    });

    it('routes e to onOpenFocused', () => {
      press('e');
      expect(handlers.onOpenFocused).toHaveBeenCalledTimes(1);
    });

    it('routes / to onFocusSearch', () => {
      press('/');
      expect(handlers.onFocusSearch).toHaveBeenCalledTimes(1);
    });

    it('routes ? to onOpenHelp', () => {
      press('?');
      expect(handlers.onOpenHelp).toHaveBeenCalledTimes(1);
    });

    it('routes Escape to onEscape', () => {
      press('Escape');
      expect(handlers.onEscape).toHaveBeenCalledTimes(1);
    });
  });

  describe('Status keys', () => {
    beforeEach(() => {
      renderHook(() => useFeedbackShortcuts(true, handlers));
    });

    it.each([['1', 0], ['2', 1], ['3', 2], ['4', 3], ['5', 4]])(
      'maps digit %s to status index %i',
      (key, idx) => {
        press(key);
        expect(handlers.onSetStatusIndex).toHaveBeenCalledWith(idx);
      },
    );
  });

  describe('Priority chord (p then 0-3)', () => {
    beforeEach(() => {
      renderHook(() => useFeedbackShortcuts(true, handlers));
    });

    it('sets priority when p is followed by a digit', () => {
      press('p');
      press('2');
      expect(handlers.onSetPriority).toHaveBeenCalledWith(2);
    });

    it('cancels chord after 1s timeout', () => {
      press('p');
      vi.advanceTimersByTime(1100);
      press('2');
      expect(handlers.onSetPriority).not.toHaveBeenCalled();
    });

    it('cancels chord on non-digit follow-up', () => {
      press('p');
      press('e'); // not a digit — chord drops; e triggers onOpenFocused on next key cycle
      expect(handlers.onSetPriority).not.toHaveBeenCalled();
    });
  });

  describe('Other commands', () => {
    beforeEach(() => {
      renderHook(() => useFeedbackShortcuts(true, handlers));
    });

    it('a → onAssignPicker', () => {
      press('a');
      expect(handlers.onAssignPicker).toHaveBeenCalledTimes(1);
    });

    it('f → onForwardFocused', () => {
      press('f');
      expect(handlers.onForwardFocused).toHaveBeenCalledTimes(1);
    });

    it('c → onCopyHandoff', () => {
      press('c');
      expect(handlers.onCopyHandoff).toHaveBeenCalledTimes(1);
    });

    it('x → toggle without shift', () => {
      press('x');
      expect(handlers.onToggleSelectFocused).toHaveBeenCalledWith(false);
    });

    it('shift+x → toggle with shift', () => {
      press('x', { shiftKey: true });
      expect(handlers.onToggleSelectFocused).toHaveBeenCalledWith(true);
    });

    it('Cmd+K → onOpenPalette regardless of focus', () => {
      press('k', { metaKey: true });
      expect(handlers.onOpenPalette).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+K → onOpenPalette regardless of focus', () => {
      press('k', { ctrlKey: true });
      expect(handlers.onOpenPalette).toHaveBeenCalledTimes(1);
    });
  });

  describe('Typing guard', () => {
    beforeEach(() => {
      renderHook(() => useFeedbackShortcuts(true, handlers));
    });

    it('suppresses single-key shortcuts when an input is focused', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      press('j');
      expect(handlers.onMoveCard).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('still allows Escape inside an input', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      press('Escape');
      expect(handlers.onEscape).toHaveBeenCalledTimes(1);

      document.body.removeChild(input);
    });

    it('still allows Cmd+K inside a textarea', () => {
      const ta = document.createElement('textarea');
      document.body.appendChild(ta);
      ta.focus();

      press('k', { metaKey: true });
      expect(handlers.onOpenPalette).toHaveBeenCalledTimes(1);

      document.body.removeChild(ta);
    });
  });
});

describe('shortcutHelp', () => {
  it('exposes a label list for the help dialog', () => {
    expect(Array.isArray(shortcutHelp)).toBe(true);
    expect(shortcutHelp.length).toBeGreaterThan(5);
    for (const row of shortcutHelp) {
      expect(typeof row.key).toBe('string');
      expect(typeof row.label).toBe('string');
    }
  });
});
