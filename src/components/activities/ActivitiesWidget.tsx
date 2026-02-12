import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';

interface ActivitiesWidgetProps {
  destination: string;
  countryCode?: string;
}

export function ActivitiesWidget({ destination, countryCode }: ActivitiesWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load GetYourGuide script if not already loaded
    const existingScript = document.querySelector('script[data-gyg-partner-id="2PBDXWH"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.src = 'https://widget.getyourguide.com/dist/pa.umd.production.min.js';
      script.setAttribute('data-gyg-partner-id', '2PBDXWH');
      document.head.appendChild(script);
    }
  }, []);

  return (
    <Box sx={{ minHeight: 400, width: '100%' }}>
      <Box
        ref={containerRef}
        data-gyg-widget="auto"
        data-gyg-partner-id="2PBDXWH"
        sx={{ width: '100%', minHeight: 400 }}
      />
    </Box>
  );
}
