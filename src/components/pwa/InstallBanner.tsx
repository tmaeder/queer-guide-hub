import { useState, useEffect } from 'react';
import { useLocation } from 'react-router';
import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWA } from './PWAProvider';

const DISMISS_KEY = 'pwa-install-dismissed';
const DISMISS_DAYS = 30;
const PAGES_BEFORE_PROMPT = 3;

function isDismissed(): boolean {
  try {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) return false;
    const expiry = parseInt(dismissed, 10);
    if (Date.now() > expiry) {
      localStorage.removeItem(DISMISS_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    const expiry = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, expiry.toString());
  } catch {
    // localStorage unavailable
  }
}

/** Detect iOS Safari for manual "Add to Home Screen" instructions */
function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window) && /Safari/.test(ua);
}

export function InstallBanner() {
  const { canInstall, isInstalled, promptInstall } = usePWA();
  const location = useLocation();
  const [pageCount, setPageCount] = useState(0);
  const [visible, setVisible] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    setPageCount((c) => c + 1);
  }, [location.pathname]);

  useEffect(() => {
    if (isInstalled || isDismissed()) return;
    if (pageCount >= PAGES_BEFORE_PROMPT && (canInstall || isIOSSafari())) {
      setVisible(true);
    }
  }, [pageCount, canInstall, isInstalled]);

  const handleInstall = async () => {
    if (isIOSSafari()) {
      setShowIOSHint(true);
      return;
    }
    const accepted = await promptInstall();
    if (accepted) {
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    dismiss();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="complementary"
      aria-label="Install app"
      className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-[1300] w-[calc(100%-32px)] sm:w-auto max-w-[420px] rounded-2xl border border-border bg-background/95 backdrop-blur-md shadow-xl p-4 flex items-start gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <img
        src="/icons/icon-96.png"
        alt=""
        className="w-11 h-11 rounded-xl border border-border shadow-sm shrink-0 mt-0.5"
      />
      <div className="flex-1 min-w-0">
        {showIOSHint ? (
          <>
            <p className="text-sm font-semibold mb-1">Add to Home Screen</p>
            <span className="text-xs text-muted-foreground">
              Tap the share button in Safari, then select "Add to Home Screen".
            </span>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold mb-1">Install Queer Guide</p>
            <span className="text-xs text-muted-foreground">
              Quick access from your home screen — works offline too.
            </span>
          </>
        )}
        {!showIOSHint && (
          <Button
            size="sm"
            onClick={handleInstall}
            className="mt-2 font-semibold rounded-lg"
          >
            <Download size={16} className="mr-2" />
            Install
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDismiss}
        aria-label="Dismiss install prompt"
        className="h-7 w-7 p-0 -ml-1 -mt-1"
      >
        <X size={18} />
      </Button>
    </div>
  );
}
