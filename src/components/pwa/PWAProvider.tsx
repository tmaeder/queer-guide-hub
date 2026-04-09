import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

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

export const usePWA = () => useContext(PWAContext);

export function PWAProvider({ children }: { children: ReactNode }) {
  const [canInstall, setCanInstall] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const updateToastId = useRef<string | number | undefined>(undefined);

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
      toast.success('Back online', { duration: 3000 });
    };
    const onOffline = () => {
      setIsOnline(false);
      toast.warning('You\'re offline', {
        description: 'Some features may be unavailable.',
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

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        const showUpdateToast = () => {
          // Dismiss any previous update toast
          if (updateToastId.current !== undefined) {
            toast.dismiss(updateToastId.current);
          }
          updateToastId.current = toast.info('A new version is available', {
            description: 'Refresh to get the latest features.',
            duration: Infinity,
            action: {
              label: 'Refresh',
              onClick: () => {
                registration.waiting?.postMessage('SKIP_WAITING');
              },
            },
          });
        };

        // Check if a waiting SW already exists (e.g. user refreshed before accepting update)
        if (registration.waiting) {
          showUpdateToast();
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              showUpdateToast();
            }
          });
        });

        // When the new SW takes over, reload the page
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });

        // Periodically check for SW updates (every 60 min) for long-lived tabs
        const updateInterval = setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);

        // Clean up interval if the page is about to unload
        window.addEventListener('beforeunload', () => clearInterval(updateInterval), { once: true });
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
