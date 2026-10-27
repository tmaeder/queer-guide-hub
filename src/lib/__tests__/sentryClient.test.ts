import { beforeEach, describe, expect, it, vi } from 'vitest';

const { consent, captureException, addBreadcrumb, loadSDK } = vi.hoisted(() => ({
  consent: vi.fn(() => false),
  loadSDK: vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));
vi.mock('../analyticsConsent', () => ({ hasAnalyticsConsent: consent }));
vi.mock('@sentry/react', () => {
  loadSDK();
  return { captureException, addBreadcrumb };
});

import * as client from '../sentryClient';

describe('optional diagnostics loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consent.mockReturnValue(false);
  });

  it('does not report or load diagnostics without consent', async () => {
    const report = vi.fn();
    client.withSentry(report);
    client.captureException(new Error('private'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(report).not.toHaveBeenCalled();
    expect(loadSDK).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('forwards errors and breadcrumbs after consent', async () => {
    consent.mockReturnValue(true);
    const error = new Error('diagnostic');
    const context = { tags: { section: 'home' } };
    const breadcrumb = { category: 'map', message: 'loaded' };
    client.captureException(error, context);
    client.addBreadcrumb(breadcrumb);
    await vi.waitFor(() => {
      expect(captureException).toHaveBeenCalledWith(error, context);
      expect(addBreadcrumb).toHaveBeenCalledWith(breadcrumb);
    });
  });

  it('rechecks consent after the asynchronous import', async () => {
    consent.mockReturnValueOnce(true).mockReturnValue(false);
    client.captureException(new Error('withdrawn'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(captureException).not.toHaveBeenCalled();
  });

  it('contains reporting failures', async () => {
    consent.mockReturnValue(true);
    const report = vi.fn(() => {
      throw new Error('SDK blocked');
    });
    client.withSentry(report);
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
  });
});
