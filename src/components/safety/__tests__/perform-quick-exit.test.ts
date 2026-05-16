/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { performQuickExit } from '../perform-quick-exit';

describe('performQuickExit', () => {
  it('runs without throwing', () => {
    const replace = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, replace, href: 'https://example.com' },
    });
    expect(() => performQuickExit()).not.toThrow();
  });
});
