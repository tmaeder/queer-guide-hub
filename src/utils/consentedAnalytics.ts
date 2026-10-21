import { analyticsAllowed, onAnalyticsConsentChange } from '@/lib/analyticsConsent';

export const ANALYTICS_READY_EVENT = 'qgAnalyticsReady';

const MAX_QUEUED_EVENTS = 100;
const QUEUED_EVENT_TTL_MS = 30_000;

type UmamiTracker = {
  track?: (event: string, data: Record<string, string>) => void;
};

interface QueuedEvent {
  event: string;
  data: Record<string, string>;
  queuedAt: number;
}

let queue: QueuedEvent[] = [];
let listenersInstalled = false;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

function tracker(): UmamiTracker | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { umami?: UmamiTracker }).umami;
}

function clearExpiryTimer(): void {
  if (expiryTimer !== undefined) {
    clearTimeout(expiryTimer);
    expiryTimer = undefined;
  }
}

function discardExpired(now = Date.now()): void {
  queue = queue.filter(({ queuedAt }) => now - queuedAt < QUEUED_EVENT_TTL_MS);
  if (queue.length === 0) clearExpiryTimer();
}

function clearQueue(): void {
  queue = [];
  clearExpiryTimer();
}

function scheduleExpiry(): void {
  if (expiryTimer !== undefined || queue.length === 0) return;
  const wait = Math.max(0, queue[0].queuedAt + QUEUED_EVENT_TTL_MS - Date.now());
  expiryTimer = setTimeout(() => {
    expiryTimer = undefined;
    discardExpired();
    scheduleExpiry();
  }, wait);
}

function flushQueue(): void {
  discardExpired();
  if (!analyticsAllowed()) {
    clearQueue();
    return;
  }

  const umami = tracker();
  if (!umami?.track) return;

  const pending = queue;
  clearQueue();
  for (const item of pending) {
    try {
      umami.track(item.event, item.data);
    } catch {
      // Analytics must never break the caller or retry a permanently bad event.
    }
  }
}

function installListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  window.addEventListener(ANALYTICS_READY_EVENT, flushQueue);
  onAnalyticsConsentChange((allowed) => {
    if (!allowed) clearQueue();
    else flushQueue();
  });
}

/**
 * Deliver a named first-party analytics event without losing consented actions
 * while the asynchronously injected tracker is still loading.
 */
export function trackConsentedEvent(event: string, data: Record<string, string>): void {
  try {
    if (!analyticsAllowed()) return;
    installListeners();
    discardExpired();

    const umami = tracker();
    if (umami?.track) {
      flushQueue();
      umami.track(event, data);
      return;
    }

    queue.push({ event, data: { ...data }, queuedAt: Date.now() });
    if (queue.length > MAX_QUEUED_EVENTS) queue.shift();
    scheduleExpiry();
  } catch {
    // Analytics must never break the caller.
  }
}
