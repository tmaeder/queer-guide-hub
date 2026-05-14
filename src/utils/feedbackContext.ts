/**
 * feedbackContext — capture rich browser context for feedback submissions.
 *
 * - installErrorBuffer()   hooks window error events + console.error, keeps last 20
 * - installNetworkBuffer() wraps fetch, keeps last 10 failed requests
 * - captureContext()       snapshots URL, viewport, UA, errors, network failures
 * - captureScreenshot()    lazy-loads html2canvas, returns JPEG blob
 */

interface ErrorEntry {
  message: string;
  stack?: string;
  source?: string;
  ts: string;
}

interface NetworkFailureEntry {
  method: string;
  url: string;
  status: number;
  ts: string;
}

export interface FeedbackContext {
  url: string;
  viewport: { width: number; height: number };
  user_agent: string;
  color_scheme: 'light' | 'dark';
  timestamp: string;
  errors: ErrorEntry[];
  network_failures: NetworkFailureEntry[];
}

const MAX_ERRORS = 20;
const MAX_NETWORK_FAILURES = 10;

const errorBuffer: ErrorEntry[] = [];
const networkBuffer: NetworkFailureEntry[] = [];

let errorBufferInstalled = false;
let networkBufferInstalled = false;

function pushError(entry: ErrorEntry) {
  errorBuffer.push(entry);
  if (errorBuffer.length > MAX_ERRORS) errorBuffer.shift();
}

function pushNetworkFailure(entry: NetworkFailureEntry) {
  networkBuffer.push(entry);
  if (networkBuffer.length > MAX_NETWORK_FAILURES) networkBuffer.shift();
}

export function installErrorBuffer() {
  if (errorBufferInstalled || typeof window === 'undefined') return;
  errorBufferInstalled = true;

  window.addEventListener('error', (event) => {
    pushError({
      message: event.message || 'Unknown error',
      stack: event.error?.stack,
      source: event.filename,
      ts: new Date().toISOString(),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    pushError({
      message: reason?.message || String(reason) || 'Unhandled rejection',
      stack: reason?.stack,
      ts: new Date().toISOString(),
    });
  });

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    try {
      const message = args
        .map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ')
        .slice(0, 500);
      const firstError = args.find((a): a is Error => a instanceof Error);
      pushError({
        message,
        stack: firstError?.stack,
        ts: new Date().toISOString(),
      });
    } catch {
      // Swallow — never break console.error
    }
    originalConsoleError.apply(console, args);
  };
}

export function installNetworkBuffer() {
  if (networkBufferInstalled || typeof window === 'undefined' || !window.fetch) return;
  networkBufferInstalled = true;

  const originalFetch = window.fetch;
  window.fetch = async function patchedFetch(...args: Parameters<typeof fetch>) {
    const [input, init] = args;
    const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET') || 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    try {
      const response = await originalFetch.apply(this, args);
      if (!response.ok && response.status >= 400) {
        pushNetworkFailure({
          method,
          url: url.slice(0, 500),
          status: response.status,
          ts: new Date().toISOString(),
        });
      }
      return response;
    } catch (err) {
      pushNetworkFailure({
        method,
        url: url.slice(0, 500),
        status: 0,
        ts: new Date().toISOString(),
      });
      throw err;
    }
  };
}

export function captureContext(): FeedbackContext {
  const colorScheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return {
    url: window.location.href,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    user_agent: navigator.userAgent,
    color_scheme: colorScheme,
    timestamp: new Date().toISOString(),
    errors: [...errorBuffer],
    network_failures: [...networkBuffer],
  };
}

export async function captureScreenshot(): Promise<Blob | null> {
  try {
    const { toJpeg } = await import('html-to-image');
    const dataUrl = await toJpeg(document.body, {
      quality: 0.7,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      width: Math.min(window.innerWidth, 1280),
      height: window.innerHeight,
    });
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}
