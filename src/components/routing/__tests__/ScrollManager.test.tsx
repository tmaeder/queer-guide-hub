import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router';
import { ScrollManager } from '../ScrollManager';
import { resetScrollPositions } from '@/lib/scrollPositions';

/**
 * jsdom has no layout: scrollHeight is 0, so window.scrollTo() would not move
 * anything. These tests stub the scroll surface and assert on what the manager
 * ASKS for, which is the part this component owns. Whether the browser can
 * honour it is covered by e2e/scroll-restoration.spec.ts.
 */
let scrollTop = 0;
const scrolls: number[] = [];

/**
 * jsdom never dispatches scroll events of its own, and the manager learns the
 * live offset from that event — so a test that only assigns to scrollY is not
 * exercising the code at all.
 */
const readerScrollsTo = (y: number) => {
  scrollTop = y;
  document.dispatchEvent(new Event('scroll'));
};

const Nav = ({ to }: { to: string }) => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      go
    </button>
  );
};

const renderApp = (initial = '/about') =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <ScrollManager />
      <Routes>
        <Route path="/about" element={<Nav to="/venues" />} />
        <Route path="/venues" element={<Nav to="/venues?category=sauna" />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ScrollManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetScrollPositions();
    scrollTop = 0;
    scrolls.length = 0;
    vi.spyOn(window, 'scrollTo').mockImplementation(((x: number, y: number) => {
      scrollTop = typeof x === 'number' ? y : 0;
      scrolls.push(scrollTop);
    }) as typeof window.scrollTo);
    Object.defineProperty(window, 'scrollY', { get: () => scrollTop, configurable: true });
    // jsdom's History does not implement scrollRestoration at all, which is
    // why ScrollManager feature-detects it. Supply it so the takeover is
    // observable here.
    Object.defineProperty(window.history, 'scrollRestoration', {
      value: 'auto',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders nothing', () => {
    const { container } = renderApp();
    expect(container.innerHTML).toBe('<button type="button">go</button>');
  });

  it('takes over scroll restoration from the browser', () => {
    // Chrome restores the offset itself on a same-document Back, before React
    // has rendered the route's content — against an empty document, so it
    // clamps to nothing. One owner, not two.
    renderApp();
    expect(window.history.scrollRestoration).toBe('manual');
  });

  it('gives the browser its behaviour back on unmount', () => {
    const { unmount } = renderApp();
    unmount();
    expect(window.history.scrollRestoration).toBe('auto');
  });

  it('does not scroll on the first render', () => {
    renderApp();
    expect(scrolls).toEqual([]);
  });

  it('scrolls to the top when a link goes to a different page', () => {
    const { getByRole } = renderApp('/about');
    scrollTop = 4163; // the reader had read to the bottom
    act(() => {
      getByRole('button').click();
    });
    expect(scrolls).toEqual([0]);
  });

  it('does not file the page it LEFT against the page it arrived at', () => {
    // If the incoming route's skeleton has already clamped the offset to 0,
    // writeTop(0) is a no-op and fires no scroll event. Without re-seeding
    // from the DOM the manager would still hold the previous page's offset
    // and file it against the new entry, so a later Back would "restore" the
    // reader to the bottom of a page they had never scrolled — the original
    // defect, re-entering through the restore path.
    const { getByRole } = renderApp('/about');
    readerScrollsTo(4163);
    // The commit clamps the short skeleton to 0 BEFORE our effect runs, so
    // the manager's own writeTop(0) changes nothing and raises no event.
    scrollTop = 0;
    act(() => {
      getByRole('button').click(); // -> /venues
    });
    act(() => {
      getByRole('button').click(); // -> /venues?category=sauna
    });
    // Entries are written in visit order: /about, then /venues. /about really
    // was left at 4163; /venues must be recorded at 0, not inherit it.
    const stored = Object.values(
      JSON.parse(sessionStorage.getItem('qg:scroll-positions') ?? '{}') as Record<string, number>,
    );
    expect(stored).toEqual([4163, 0]);
  });

  it("scrolls the admin console's own container, not the window", () => {
    // AdminShell renders an `overflow-auto` main and the window never scrolls
    // inside the console, so a window-only implementation would reset nothing
    // and admin would keep landing at the previous page's offset.
    const container = document.createElement('div');
    container.setAttribute('data-scroll-container', '');
    container.scrollTop = 1200;
    document.body.appendChild(container);
    try {
      const { getByRole } = renderApp('/about');
      act(() => {
        getByRole('button').click();
      });
      expect(container.scrollTop).toBe(0);
      expect(scrolls).toEqual([]); // the window was left alone
    } finally {
      container.remove();
    }
  });

  it('leaves the reader alone when only the query changes', () => {
    const { getByRole } = renderApp('/venues');
    scrollTop = 639;
    act(() => {
      getByRole('button').click();
    });
    expect(scrolls).toEqual([]);
    expect(scrollTop).toBe(639);
  });
});
