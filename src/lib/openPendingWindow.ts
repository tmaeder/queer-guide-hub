/**
 * Open a window inside a click when its URL is only known after an `await`.
 *
 * Safari (and iOS browsers, which all run WebKit) allow `window.open()` only
 * while the click's user activation is still live, and an `await` on a network
 * call spends it, so `const url = await fetchUrl(); window.open(url)` is
 * silently treated as a blocked popup there. Chromium tolerates a short delay,
 * which is why this works on desktop Chrome and not on an iPhone.
 *
 * Call this synchronously in the handler, BEFORE the first `await`, then
 * `navigate(url)` once the URL is known, or `close()` if there is none.
 *
 * `noopener` cannot be passed as a feature here: with it `window.open()`
 * returns null by spec, so there would be no window to navigate. The opener is
 * severed by hand instead, before any third-party page loads in the window.
 */
export interface PendingWindow {
  /** The opened window, or null when the browser blocked it. */
  readonly window: Window | null;
  /**
   * Send the pending window to `url`. Returns false when there is no window to
   * send (blocked, or closed by the user meanwhile), so the caller can fall back.
   */
  navigate(url: string): boolean;
  /** Close the pending window, e.g. when the URL could not be obtained. */
  close(): void;
}

export function openPendingWindow(target = '_blank', features?: string): PendingWindow {
  const win = window.open('about:blank', target, features);
  if (win) {
    try {
      win.opener = null;
    } catch {
      /* cross-origin or locked down: nothing to sever */
    }
  }
  return {
    window: win,
    navigate(url: string) {
      if (!win || win.closed) return false;
      win.location.href = url;
      return true;
    },
    close() {
      if (win && !win.closed) win.close();
    },
  };
}
