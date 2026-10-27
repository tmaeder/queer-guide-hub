import { beforeEach, describe, expect, it, vi } from 'vitest';

const { consent, init, browserTracingIntegration, feedbackIntegration } = vi.hoisted(() => ({
  consent: vi.fn(() => false),
  init: vi.fn(),
  browserTracingIntegration: vi.fn(),
  feedbackIntegration: vi.fn(),
}));
vi.mock('@/lib/analyticsConsent', () => ({ hasAnalyticsConsent: consent }));
vi.mock('@sentry/react', () => ({ init, browserTracingIntegration, feedbackIntegration }));

describe('Sentry installation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.com/1');
    consent.mockReturnValue(false);
  });

  it('loads on opt-in, initializes once, and ignores unconsented startup', async () => {
    const { installSentry } = await import('../sentry');
    installSentry();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(init).not.toHaveBeenCalled();
    consent.mockReturnValue(true);
    window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { detail: { analytics: true } }));
    window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { detail: { analytics: true } }));
    await vi.waitFor(() => expect(init).toHaveBeenCalledOnce());
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@example.com/1',
        tracesSampleRate: 0.1,
      }),
    );
  });
});
