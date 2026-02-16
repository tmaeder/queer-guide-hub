import { useEffect, useRef, useState, Component, ReactNode, ErrorInfo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { Activity, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const GYG_PARTNER_ID = '2PBDXWH';
const GYG_SCRIPT_URL = 'https://widget.getyourguide.com/dist/pa.umd.production.min.js';
/** Max time to wait for the widget to render before showing fallback */
const WIDGET_TIMEOUT_MS = 15_000;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface ActivitiesWidgetProps {
  destination: string;
  countryCode?: string;
}

/* ------------------------------------------------------------------ */
/*  Error Boundary                                                     */
/* ------------------------------------------------------------------ */
class WidgetErrorBoundary extends Component<
  { children: ReactNode; destination: string },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; destination: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[ActivitiesWidget] Widget error caught:', error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return <ActivitiesComingSoon destination={this.props.destination} />;
    }
    return this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/*  Fallback UI                                                        */
/* ------------------------------------------------------------------ */
function ActivitiesComingSoon({ destination }: { destination: string }) {
  const searchUrl = `https://www.getyourguide.com/s/?q=${encodeURIComponent(destination + ' LGBTQ')}&partner_id=${GYG_PARTNER_ID}`;

  return (
    <Box sx={{
      textAlign: 'center',
      py: 6,
      px: 3,
      bgcolor: 'action.hover',
      borderRadius: 2,
      border: '2px dashed',
      borderColor: 'divider',
    }}>
      <Box sx={{
        p: 2,
        bgcolor: 'rgba(var(--muted-rgb, 128, 128, 128), 0.15)',
        borderRadius: '50%',
        width: 64,
        height: 64,
        mx: 'auto',
        mb: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Activity style={{ height: 32, width: 32, color: 'var(--muted-foreground)' }} />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
        Tours & Activities
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 2, maxWidth: 400, mx: 'auto' }}>
        Discover amazing experiences in {destination}. Browse tours, activities, and attractions.
      </Typography>
      <Button
        variant="outline"
        size="sm"
        onClick={() => window.open(searchUrl, '_blank', 'noopener,noreferrer')}
      >
        <ExternalLink style={{ height: 14, width: 14, marginRight: 6 }} />
        Browse Tours on GetYourGuide
      </Button>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  Singleton script loader                                            */
/*  Ensures only one <script> tag regardless of how many widgets mount */
/* ------------------------------------------------------------------ */
let gygScriptPromise: Promise<void> | null = null;

function loadGygScript(): Promise<void> {
  if (gygScriptPromise) return gygScriptPromise;

  // Check if script was already injected (e.g. by a previous session/HMR)
  const existing = document.querySelector(`script[src="${GYG_SCRIPT_URL}"]`);
  if (existing) {
    gygScriptPromise = Promise.resolve();
    return gygScriptPromise;
  }

  gygScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = GYG_SCRIPT_URL;
    script.setAttribute('data-gyg-partner-id', GYG_PARTNER_ID);
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => {
      gygScriptPromise = null;
      reject(new Error('Failed to load GetYourGuide widget script'));
    };
    document.head.appendChild(script);
  });

  return gygScriptPromise;
}

/* ------------------------------------------------------------------ */
/*  Main Widget                                                        */
/*                                                                     */
/*  Strategy: Render the widget container at full opacity immediately.  */
/*  The GYG script will inject an iframe into the container.            */
/*  We show a loading spinner overlay until either:                     */
/*    a) content is detected (iframe/child nodes) → hide spinner        */
/*    b) timeout expires without content → show fallback                */
/*                                                                     */
/*  After the script loads, we call GYG.refresh() to trigger a DOM     */
/*  re-scan since this is an SPA and the container wasn't present      */
/*  when the script first ran.                                         */
/* ------------------------------------------------------------------ */
export function ActivitiesWidget({ destination, countryCode }: ActivitiesWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Load script on mount
  useEffect(() => {
    let cancelled = false;

    loadGygScript()
      .then(() => { if (!cancelled) setScriptLoaded(true); })
      .catch(() => { if (!cancelled) setScriptFailed(true); });

    return () => { cancelled = true; };
  }, []);

  // After script loads: call GYG.refresh(), observe for content, set timeout
  useEffect(() => {
    if (!scriptLoaded || scriptFailed) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let observer: MutationObserver | undefined;
    let pollId: ReturnType<typeof setTimeout> | undefined;

    const checkContent = () => {
      const el = containerRef.current;
      if (!el) return false;
      return !!(
        el.querySelector('iframe') ||
        el.querySelector('[class*="gyg"]') ||
        el.querySelector('[data-gyg-href]') ||
        (el.children.length > 0 && el.innerHTML.length > 100)
      );
    };

    const onContentFound = () => {
      if (cancelled) return;
      cancelled = true;
      if (observer) observer.disconnect();
      if (pollId) clearTimeout(pollId);
      if (timeoutId) clearTimeout(timeoutId);
      setContentReady(true);
    };

    // Immediate check — content might already exist
    if (checkContent()) {
      onContentFound();
      return;
    }

    // MutationObserver: detect when GYG injects the iframe
    if (containerRef.current) {
      observer = new MutationObserver(() => {
        if (checkContent()) onContentFound();
      });
      observer.observe(containerRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }

    // Tell GYG to re-scan the DOM (SPA: container appeared after script ran)
    const gygGlobal = (window as any).GYG;
    if (gygGlobal && typeof gygGlobal.refresh === 'function') {
      // Delay slightly to ensure React has flushed the container to the DOM
      setTimeout(() => {
        if (!cancelled) {
          try { gygGlobal.refresh(); } catch { /* ignore */ }
        }
      }, 100);
    }

    // Polling fallback: check periodically in case MutationObserver misses it
    const poll = () => {
      if (cancelled) return;
      if (checkContent()) { onContentFound(); return; }
      pollId = setTimeout(poll, 500);
    };
    pollId = setTimeout(poll, 500);

    // Timeout: show fallback after WIDGET_TIMEOUT_MS
    timeoutId = setTimeout(() => {
      if (!cancelled) {
        cancelled = true;
        if (observer) observer.disconnect();
        if (pollId) clearTimeout(pollId);
        console.warn('[ActivitiesWidget] Widget did not render within timeout');
        setTimedOut(true);
      }
    }, WIDGET_TIMEOUT_MS);

    return () => {
      cancelled = true;
      if (observer) observer.disconnect();
      if (pollId) clearTimeout(pollId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [scriptLoaded, scriptFailed, destination]);

  // Script failed to load → fallback
  if (scriptFailed) {
    return <ActivitiesComingSoon destination={destination} />;
  }

  // Timeout without content → fallback
  if (timedOut && !contentReady) {
    return <ActivitiesComingSoon destination={destination} />;
  }

  return (
    <WidgetErrorBoundary destination={destination}>
      <Box sx={{ minHeight: 400, width: '100%', position: 'relative' }}>
        {/* Loading spinner — shown until content is detected or script loads */}
        {!contentReady && (
          <Box sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            zIndex: 1,
            pointerEvents: 'none',
          }}>
            <CircularProgress size={24} sx={{ color: 'text.secondary' }} />
            <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
              Loading tours & activities...
            </Typography>
          </Box>
        )}

        {/*
          Widget container: ALWAYS rendered at full opacity.
          The GYG script reads data-gyg-* attributes and injects an iframe.
          The spinner overlay sits on top until content is detected.
        */}
        <Box
          ref={containerRef}
          data-gyg-widget="auto"
          data-gyg-partner-id={GYG_PARTNER_ID}
          data-gyg-q={destination}
          data-gyg-locale-code="en-US"
          data-gyg-number-of-items="4"
          sx={{ width: '100%', minHeight: 400 }}
        />
      </Box>
    </WidgetErrorBoundary>
  );
}
