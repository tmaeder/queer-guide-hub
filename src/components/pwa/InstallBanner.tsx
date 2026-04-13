import { useState, useEffect } from 'react';
import { useLocation } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { X, Download } from 'lucide-react';
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

  // Count unique page navigations
  useEffect(() => {
    setPageCount((c) => c + 1);
  }, [location.pathname]);

  // Show banner after enough pages visited
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
    <Box
      role="complementary"
      aria-label="Install app"
      sx={{
        position: 'fixed',
        bottom: { xs: 16, sm: 24 },
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1300,
        width: { xs: 'calc(100% - 32px)', sm: 'auto' },
        maxWidth: 420,
        bgcolor: 'background.paper',
        boxShadow: '0 8px 32px rgba(0,0,0,0.24)',
        p: 2,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        animation: 'slideUp 0.3s ease-out',
        '@keyframes slideUp': {
          from: { opacity: 0, transform: 'translateX(-50%) translateY(16px)' },
          to: { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
        },
      }}
    >
      <Box
        component="img"
        src="/icons/icon-96.png"
        alt=""
        sx={{ width: 40, height: 40, borderRadius: 1.5, flexShrink: 0, mt: 0.25 }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {showIOSHint ? (
          <>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              Add to Home Screen
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Tap the share button in Safari, then select "Add to Home Screen".
            </Typography>
          </>
        ) : (
          <>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              Install Queer Guide
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Quick access from your home screen — works offline too.
            </Typography>
          </>
        )}
        {!showIOSHint && (
          <Button
            size="small"
            variant="contained"
            startIcon={<Download size={16} />}
            onClick={handleInstall}
            sx={{ mt: 1, textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            Install
          </Button>
        )}
      </Box>
      <IconButton
        size="small"
        onClick={handleDismiss}
        aria-label="Dismiss install prompt"
        sx={{ ml: -0.5, mt: -0.5 }}
      >
        <X size={18} />
      </IconButton>
    </Box>
  );
}
