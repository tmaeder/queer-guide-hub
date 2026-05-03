import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Ensure DOM is reset between tests
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement matchMedia — MUI theme hooks rely on it.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// jsdom doesn't implement IntersectionObserver either.
if (typeof window.IntersectionObserver === 'undefined') {
  window.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];
  } as unknown as typeof IntersectionObserver;
}

// jsdom doesn't implement Element.prototype.hasPointerCapture — Radix uses it.
if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// jsdom doesn't implement scrollIntoView — Radix uses it.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom never fires Image load events — Radix Avatar relies on it to render <img>.
if (typeof window !== 'undefined' && typeof window.Image !== 'undefined') {
  Object.defineProperty(window.Image.prototype, 'src', {
    set(value: string) {
      this.setAttribute('src', value);
      setTimeout(() => this.dispatchEvent(new Event('load')), 0);
    },
    get() {
      return this.getAttribute('src') ?? '';
    },
  });
}

// ResizeObserver — used by some MUI + shadcn components.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
