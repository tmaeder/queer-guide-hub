import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import i18n from '@/i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAContextValue {
  /** Whether the app can be installed (beforeinstallprompt was captured) */
  canInstall: boolean;
  /** Whether the app is running in standalone/installed mode */
  isInstalled: boolean;
  /** Whether the browser is online */
  isOnline: boolean;
  /** Trigger the native install prompt */
  promptInstall: () => Promise<boolean>;
}

const PWAContext = createContext<PWAContextValue>({
  canInstall: false,
  isInstalled: false,
  isOnline: true,
  promptInstall: async () => false,
});

// eslint-disable-next-line react-refresh/only-export-components
export const usePWA = () => useContext(PWAContext);

export function PWAProvider({ children }: { children: ReactNode }) {
  const [canInstall, setCanInstall] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  const isInstalled =
    typeof window !== 'undefined' &&
    window.matchMedia('(display-mode: standalone)').matches;

  // Capture install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Detect when app gets installed
    const installedHandler = () => {
      setCanInstall(false);
      deferredPrompt.current = null;
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  // Network status tracking
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      toast.success(i18n.t('pwa.backOnline'), { duration: 3000 });
    };
    const onOffline = () => {
      setIsOnline(false);
      toast.warning(i18n.t('pwa.offline.title'), {
        description: i18n.t('pwa.offline.description'),
        duration: 5000,
      });
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Service worker registration + update flow
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

    let updateInterval: ReturnType<typeof setInterval> | undefined;
    let hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;

    // Listen before registration so an already-installed waiting worker cannot
    // activate in the small gap between register() resolving and handler setup.
    // A new worker taking over an existing client gets exactly one reload; the
    // first-ever controller on a fresh visit does not interrupt the session.
    const onControllerChange = () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        // Router changes must not remain behind a manual toast indefinitely:
        // an old controlled client would otherwise render its own 404 for a
        // route that already exists at the origin. Activate both workers that
        // were already waiting and updates discovered during this session.
        if (registration.waiting) {
          registration.waiting.postMessage('SKIP_WAITING');
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              newWorker.postMessage('SKIP_WAITING');
            }
          });
        });

        // Do not wait for the browser's implementation-defined update check.
        // This is especially important for installed PWAs and long-lived tabs.
        registration.update().catch(() => {});

        // Periodically check for SW updates (every 60 min) for long-lived tabs
        updateInterval = setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);
      } catch (error) {
        console.debug('[SW] Registration failed:', error);
      }
    };

    // Register after the page has loaded to not compete with critical resources
    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW, { once: true });
    }

    return () => {
      window.removeEventListener('load', registerSW);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (updateInterval !== undefined) clearInterval(updateInterval);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt.current) return false;
    try {
      await deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;
      if (outcome === 'accepted') {
        setCanInstall(false);
        deferredPrompt.current = null;
        return true;
      }
    } catch {
      // prompt() can throw if already called
    }
    return false;
  }, []);

  return (
    <PWAContext.Provider value={{ canInstall, isInstalled, isOnline, promptInstall }}>
      {children}
    </PWAContext.Provider>
  );
}
