// Surface uncaught errors and unhandled promise rejections so users notice
// something went wrong rather than seeing the app silently misbehave.
// Sentry already auto-captures these in production; this layer adds a single,
// debounced toast plus a console log in dev. It does NOT replace the existing
// installErrorBuffer() listener in feedbackContext.

import { toast } from '@/hooks/use-toast';
import { fileError, type AutoFileKind } from '@/utils/autoFileError';

let installed = false;
let lastSurfaceAt = 0;

const NOISY_PATTERNS = [
  /ResizeObserver loop/i,
  /Loading chunk .* failed/i,
  /Failed to fetch dynamically imported module/i,
  /Lock was stolen by another request/i,
  /cannot add `postgres_changes` callbacks/i,
];

function isNoisy(message: string): boolean {
  return NOISY_PATTERNS.some((re) => re.test(message));
}

function surface() {
  const now = Date.now();
  // One toast per 8s — prevents storming the UI when a render loops.
  if (now - lastSurfaceAt < 8000) return;
  lastSurfaceAt = now;
  try {
    toast({
      title: 'Something went wrong',
      description: 'Refresh the page if the issue persists.',
      variant: 'destructive',
    });
  } catch {
    // Toast provider may not be mounted yet (very early boot). Skip.
  }
}

/** Shared path for both listeners: skip noise once, then toast + file. */
function report(kind: AutoFileKind, name: string, message: string) {
  if (isNoisy(message)) return;
  surface();
  fileError({
    kind,
    error: { name, message },
    routePath: typeof window !== 'undefined' ? window.location.pathname : '/',
  });
}

export function installGlobalErrorSurfacing(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { name?: string; message?: string } | string | undefined;
    const message =
      typeof reason === 'string'
        ? reason
        : reason?.message || 'Unhandled promise rejection';
    const name = typeof reason === 'object' && reason?.name ? reason.name : 'UnhandledRejection';
    report('unhandled_rejection', name, message);
  });

  window.addEventListener('error', (event) => {
    const name = (event.error as { name?: string } | undefined)?.name || 'Error';
    report('window_error', name, event.message || 'Uncaught error');
  });
}
