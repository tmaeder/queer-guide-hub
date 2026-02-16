import { useEffect, useRef, useState, Component, ReactNode, ErrorInfo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Activity, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActivitiesWidgetProps {
  destination: string;
  countryCode?: string;
}

/** Error boundary specifically for the GetYourGuide widget */
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

/** Fallback UI when widget fails or isn't available */
function ActivitiesComingSoon({ destination }: { destination: string }) {
  const searchUrl = `https://www.getyourguide.com/s/?q=${encodeURIComponent(destination + ' LGBTQ')}&partner_id=2PBDXWH`;

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

export function ActivitiesWidget({ destination, countryCode }: ActivitiesWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);

  useEffect(() => {
    // Check if script is already loaded and functional
    const existingScript = document.querySelector('script[data-gyg-partner-id="2PBDXWH"]');
    if (existingScript) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = 'https://widget.getyourguide.com/dist/pa.umd.production.min.js';
    script.setAttribute('data-gyg-partner-id', '2PBDXWH');

    script.onload = () => setScriptLoaded(true);
    script.onerror = () => {
      console.warn('[ActivitiesWidget] Failed to load GetYourGuide widget script');
      setScriptFailed(true);
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup: don't remove script (may be used by other instances)
    };
  }, []);

  // Timeout fallback: if script "loads" but widget never renders content
  useEffect(() => {
    if (!scriptLoaded || scriptFailed) return;

    const timeout = setTimeout(() => {
      if (containerRef.current) {
        const hasContent = containerRef.current.querySelector('iframe, [class*="gyg"], [data-gyg]');
        if (!hasContent) {
          console.warn('[ActivitiesWidget] Widget loaded but no content rendered after 8s');
          setScriptFailed(true);
        }
      }
    }, 8000);

    return () => clearTimeout(timeout);
  }, [scriptLoaded, scriptFailed]);

  // Show fallback if script failed
  if (scriptFailed) {
    return <ActivitiesComingSoon destination={destination} />;
  }

  return (
    <WidgetErrorBoundary destination={destination}>
      <Box sx={{ minHeight: 400, width: '100%', position: 'relative' }}>
        {!scriptLoaded && (
          <Box sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
              Loading tours & activities...
            </Typography>
          </Box>
        )}
        <Box
          ref={containerRef}
          data-gyg-widget="auto"
          data-gyg-partner-id="2PBDXWH"
          data-gyg-q={destination}
          data-gyg-locale-code="en-US"
          sx={{ width: '100%', minHeight: 400 }}
        />
      </Box>
    </WidgetErrorBoundary>
  );
}
