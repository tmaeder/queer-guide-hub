import { useState, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        toast({
          title: "Back online",
          description: "Connection restored. Syncing data...",
        });
        setWasOffline(false);
        // Trigger background sync
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then((registration) => {
            // Send message to service worker for cache update
            if (registration.active) {
              registration.active.postMessage({ type: 'CACHE_UPDATE' });
            }
          });
        }
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      toast({
        title: "You're offline",
        description: "Some features may be limited. Data will sync when connection is restored.",
        variant: "destructive",
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  return { isOnline, wasOffline };
}