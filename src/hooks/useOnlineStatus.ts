import { useEffect, useState } from 'react';

/**
 * Tracks the browser's online/offline state. Mirrors `navigator.onLine`
 * and listens for `online` / `offline` events. Used by Today-mode to show
 * a banner when we're serving cached data.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return online;
}
