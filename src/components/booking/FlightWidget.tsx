import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plane } from 'lucide-react';

interface FlightWidgetProps {
  airportCode?: string;
  currency?: string;
  title?: string;
  className?: string;
  cityName?: string;
  countryName?: string;
}

export default function FlightWidget({ 
  airportCode, 
  title = 'Flight Search',
  className = ''
}: FlightWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!widgetRef.current) {
      setIsLoading(false);
      return;
    }

    // Reset states
    setIsLoading(true);
    
    // Clear any existing content
    widgetRef.current.innerHTML = '';
    
    // Create script element for the flight widget
    const script = document.createElement('script');
    script.async = true;
    script.charset = 'utf-8';
    const targetAirport = airportCode || 'LHR';
    script.src = `https://tpscr.com/content?currency=usd&trs=241762&shmarker=452012&powered_by=false&locale=en&to_name=${targetAirport}&show_header=true&limit=2&primary_color=FFFFFF00&results_background_color=FFFFFF00&form_background_color=FFFFFF00&campaign_id=111&promo_id=4478`;
    
    // Add error handling
    script.onload = () => {
      setIsLoading(false);
    };
    
    script.onerror = () => {
      setIsLoading(false);
    };
    
    // Add script to the widget container
    widgetRef.current.appendChild(script);
    
    // Set a timeout to handle cases where the widget doesn't load
    const timeout = setTimeout(() => {
      setIsLoading(false);
    }, 5000);
    
    // Cleanup function
    return () => {
      clearTimeout(timeout);
      if (widgetRef.current) {
        widgetRef.current.innerHTML = '';
      }
    };
  }, [airportCode]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plane className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading flight search...</p>
          </div>
        )}
        <div 
          ref={widgetRef} 
          className="min-h-[400px]" 
          style={{ display: isLoading ? 'none' : 'block' }} 
        />
      </CardContent>
    </Card>
  );
}