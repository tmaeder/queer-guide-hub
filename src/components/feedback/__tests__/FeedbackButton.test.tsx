/** @vitest-environment jsdom */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

const captureScreenshot = vi.hoisted(() => vi.fn());
const dialogProps = vi.hoisted(() => vi.fn());
vi.mock('@/utils/feedbackContext', () => ({ captureScreenshot }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/contribute/ContributeDialog', () => ({
  ContributeDialog: (props: unknown) => {
    dialogProps(props);
    return null;
  },
}));

import { FeedbackButton } from '../FeedbackButton';

let onIntersection: IntersectionObserverCallback;
let observedFooter: Element;
const observe = vi.fn((element: Element) => {
  observedFooter = element;
});
const disconnect = vi.fn();

function setFooterVisible(visible: boolean) {
  act(() =>
    onIntersection(
      [{ target: observedFooter, isIntersecting: visible } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
}

describe('FeedbackButton anonymous screenshot capture', () => {
  beforeEach(() => {
    dialogProps.mockClear();
    captureScreenshot.mockReset();
    captureScreenshot.mockResolvedValue(new Blob(['captured'], { type: 'image/jpeg' }));
    observe.mockClear();
    disconnect.mockClear();
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function (callback: IntersectionObserverCallback) {
        onIntersection = callback;
        return { observe, disconnect };
      }),
    );
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('captures the underlying page before opening for a signed-out visitor', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TooltipProvider>
          <FeedbackButton />
        </TooltipProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Contribute to Queer Guide/i }));

    await waitFor(() => expect(captureScreenshot).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(dialogProps).toHaveBeenLastCalledWith(
        expect.objectContaining({ open: true, screenshotBlob: expect.any(Blob) }),
      ),
    );
  });

  it('yields to the visible footer and returns when it leaves the viewport', () => {
    render(
      <MemoryRouter>
        <TooltipProvider>
          <FeedbackButton />
          <article>
            <footer>Article actions</footer>
          </article>
          <footer data-site-footer>Copyright and legal links</footer>
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(observe).toHaveBeenCalledWith(screen.getByText('Copyright and legal links'));
    setFooterVisible(true);
    expect(
      screen.queryByRole('button', { name: /Contribute to Queer Guide/i }),
    ).not.toBeInTheDocument();
    setFooterVisible(false);
    expect(screen.getByRole('button', { name: /Contribute to Queer Guide/i })).toBeVisible();
  });

  it('keeps an open contribution dialog when the trigger yields to the footer', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TooltipProvider>
          <FeedbackButton />
          <footer data-site-footer>Copyright</footer>
        </TooltipProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Contribute to Queer Guide/i }));
    await waitFor(() =>
      expect(dialogProps).toHaveBeenLastCalledWith(expect.objectContaining({ open: true })),
    );
    setFooterVisible(true);
    expect(
      screen.queryByRole('button', { name: /Contribute to Queer Guide/i }),
    ).not.toBeInTheDocument();
    expect(dialogProps).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }));
  });

  it('observes a footer mounted after the contribution trigger', async () => {
    const view = (showFooter: boolean) => (
      <TooltipProvider>
        <FeedbackButton />
        {showFooter && <footer data-site-footer>Late footer</footer>}
      </TooltipProvider>
    );
    const { rerender } = render(view(false));
    expect(observe).not.toHaveBeenCalled();
    rerender(view(true));
    await waitFor(() => expect(observe).toHaveBeenCalledWith(screen.getByText('Late footer')));
    setFooterVisible(true);
    expect(
      screen.queryByRole('button', { name: /Contribute to Queer Guide/i }),
    ).not.toBeInTheDocument();
  });

  it('reconnects when a route transition replaces the footer element', async () => {
    const view = (version: string) => (
      <TooltipProvider>
        <FeedbackButton />
        <footer key={version} data-site-footer>
          Footer {version}
        </footer>
      </TooltipProvider>
    );
    const { rerender } = render(view('first'));
    setFooterVisible(true);
    rerender(view('second'));
    await waitFor(() =>
      expect(observe).toHaveBeenLastCalledWith(screen.getByText('Footer second')),
    );
    setFooterVisible(false);
    expect(screen.getByRole('button', { name: /Contribute to Queer Guide/i })).toBeVisible();
  });

  it('restores the trigger when navigating to a page without a footer', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/legal']}>
        <TooltipProvider>
          <FeedbackButton />
          <Link to="/map">Open map</Link>
          <Routes>
            <Route path="/legal" element={<footer data-site-footer>Copyright</footer>} />
            <Route path="/map" element={<main>Map</main>} />
          </Routes>
        </TooltipProvider>
      </MemoryRouter>,
    );
    setFooterVisible(true);
    await user.click(screen.getByRole('link', { name: 'Open map' }));
    expect(screen.getByRole('button', { name: /Contribute to Queer Guide/i })).toBeVisible();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('disconnects the footer observer on unmount', () => {
    const { unmount } = render(
      <MemoryRouter>
        <TooltipProvider>
          <FeedbackButton />
          <footer data-site-footer>Copyright</footer>
        </TooltipProvider>
      </MemoryRouter>,
    );
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
