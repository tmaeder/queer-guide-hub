import { useEffect, useRef } from 'react';

interface FlightsWidgetProps {
  destination: string;
  countryCode?: string;
}

export function FlightsWidget({ destination, countryCode = 'xx' }: FlightsWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !destination) return;

    // Clear any existing content
    containerRef.current.innerHTML = '';

    // Create and append the script
    const script = document.createElement('script');
    script.async = true;
    script.charset = 'utf-8';
    
    // Format destination name for the API
    const formattedDestination = destination.toLowerCase().replace(/\s+/g, '_');
    const formattedCountryCode = countryCode.toLowerCase();
    
    script.src = `https://tpscr.com/content?currency=eur&trs=241762&shmarker=452012&powered_by=true&locale=en&to_name=${formattedDestination}_${formattedCountryCode}&show_header=false&limit=3&primary_color=000000ff&results_background_color=FFFFFF&form_background_color=FFFFFF&campaign_id=111&promo_id=4478`;

    containerRef.current.appendChild(script);

    // Cleanup function
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [destination, countryCode]);

  return (
    <div 
      ref={containerRef} 
      className="min-h-[400px] w-full"
    >
      <div className="text-center text-muted-foreground py-16">
        <p>Loading flight deals...</p>
      </div>
    </div>
  );
}