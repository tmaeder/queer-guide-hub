/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { PWAProvider, usePWA } from '../PWAProvider';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

function Inner() {
  const ctx = usePWA();
  return <span>{ctx?.canInstall ? 'yes' : 'no'}</span>;
}

describe('PWAProvider', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('provides context', () => {
    render(<PWAProvider><Inner /></PWAProvider>);
    expect(screen.getByText('no')).toBeInTheDocument();
  });

  it('shows a localized offline toast (no hardcoded English)', () => {
    render(<PWAProvider><Inner /></PWAProvider>);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(toast.warning).toHaveBeenCalledWith(
      i18n.t('pwa.offline.title'),
      expect.objectContaining({ description: i18n.t('pwa.offline.description') }),
    );
    // Translation keys must resolve to real copy, not echo the key back.
    expect(i18n.t('pwa.offline.title')).not.toBe('pwa.offline.title');
  });

  it('activates an already-waiting production service worker automatically', async () => {
    vi.stubEnv('PROD', true);
    const postMessage = vi.fn();
    const registration = Object.assign(new EventTarget(), {
      waiting: { postMessage },
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
    });
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    });

    render(<PWAProvider><Inner /></PWAProvider>);

    await waitFor(() => {
      expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
      expect(postMessage).toHaveBeenCalledWith('SKIP_WAITING');
      expect(registration.update).toHaveBeenCalledOnce();
    });
  });
});
