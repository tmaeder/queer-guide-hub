import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface FlightsWidgetProps {
  destination: string;
  countryCode?: string;
}

export function FlightsWidget({ destination, countryCode = 'xx' }: FlightsWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !destination) return;

    // Securely clear existing content without using innerHTML
    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }

    // Create and append the script securely
    const script = document.createElement('script');
    script.async = true;
    script.charset = 'utf-8';

    // Format destination name for the API (sanitize input)
    const formattedDestination = destination.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_');
    const formattedCountryCode = countryCode.toLowerCase().replace(/[^a-z]/g, '');

    // Construct URL safely
    const url = new URL('https://tpscr.com/content');
    url.searchParams.set('currency', 'eur');
    url.searchParams.set('trs', '241762');
    url.searchParams.set('shmarker', '452012');
    url.searchParams.set('powered_by', 'true');
    url.searchParams.set('locale', 'en');
    url.searchParams.set('to_name', `${formattedDestination}_${formattedCountryCode}`);
    url.searchParams.set('show_header', 'false');
    url.searchParams.set('limit', '3');
    url.searchParams.set('primary_color', '000000ff');
    url.searchParams.set('results_background_color', 'FFFFFF');
    url.searchParams.set('form_background_color', 'FFFFFF');
    url.searchParams.set('campaign_id', '111');
    url.searchParams.set('promo_id', '4478');

    script.src = url.toString();

    containerRef.current.appendChild(script);

    // Cleanup function
    return () => {
      if (containerRef.current) {
        // Securely clear content without innerHTML
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
      }
    };
  }, [destination, countryCode]);

  return (
    <Box
      ref={containerRef}
      sx={{ minHeight: 400, width: '100%' }}
    >
      <Box sx={{ textAlign: 'center', color: 'text.secondary', py: 8 }}>
        <Typography>Loading flight deals...</Typography>
      </Box>
    </Box>
  );
}
