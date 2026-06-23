import { useCallback, useRef } from 'react';
import type { MouseEvent, PointerEvent } from 'react';

interface Options {
  /** Hold duration (ms) before the long-press fires. */
  delay?: number;
  /** Pointer movement (px) that cancels the press (treat as a scroll/drag). */
  moveTolerance?: number;
}

export interface LongPressHandlers {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (e: MouseEvent) => void;
  onClickCapture: (e: MouseEvent) => void;
}

/**
 * Pointer long-press. Spread the returned handlers onto an element; `onLongPress`
 * fires once the pointer is held for `delay` ms without moving past
 * `moveTolerance`. The click that naturally follows the press is suppressed in
 * the capture phase so a long-press doesn't also trigger the element's `onClick`
 * (e.g. a link's navigation), and the native context menu is suppressed.
 *
 * NOTE: long-press is a pointer-only gesture — it is NOT keyboard or
 * screen-reader accessible. Always pair it with a visible, focusable control
 * that performs the same action (WCAG 2.1.1 Keyboard, 2.5.1 Pointer Gestures).
 */
export function useLongPress(
  onLongPress: () => void,
  { delay = 450, moveTolerance = 10 }: Options = {},
): LongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      fired.current = false;
      startPos.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, delay);
    },
    [clear, delay, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const dx = Math.abs(e.clientX - startPos.current.x);
      const dy = Math.abs(e.clientY - startPos.current.y);
      if (dx > moveTolerance || dy > moveTolerance) clear();
    },
    [clear, moveTolerance],
  );

  const onContextMenu = useCallback((e: MouseEvent) => {
    // Suppress the native long-press context menu on the held element.
    e.preventDefault();
  }, []);

  const onClickCapture = useCallback((e: MouseEvent) => {
    // Swallow the click that follows a fired long-press so the underlying
    // link/button action doesn't also run.
    if (fired.current) {
      e.preventDefault();
      e.stopPropagation();
      fired.current = false;
    }
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu,
    onClickCapture,
  };
}
